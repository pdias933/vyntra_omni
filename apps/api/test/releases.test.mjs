import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroAtualizacaoObrigatoria,
  ErroConfiguracaoReleaseInvalida,
  ErroConflitoVersaoRelease,
} from '../dist/releases/erros-releases.js';
import { ServicoReleases } from '../dist/releases/servico-releases.js';

const usuarioId = randomUUID();
const filaId = randomUUID();
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 60_000),
  sessaoId: randomUUID(),
  usuarioId,
};

function politica(sobrescritas = {}) {
  return {
    plataforma: 'ANDROID',
    versao: 1,
    versaoMinima: '2.0.0',
    versaoRecomendada: '2.1.0',
    ...sobrescritas,
  };
}

function controle(codigo, sobrescritas = {}) {
  return {
    codigo,
    desligadoEmergencialmente: false,
    estado: 'ATIVADO',
    filaAlvo: false,
    filasAlvo: [],
    id: randomUUID(),
    liberarAdministradores: false,
    percentualLiberacao: 0,
    usuarioAlvo: false,
    usuariosAlvo: [],
    versao: 1,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = { auditoria: [], autorizacao: [], atualizacoes: [] };
  let controleAtual = sobrescritas.controleAtual;
  let politicaAtual = sobrescritas.politicaAtual ?? politica();
  const repositorio = {
    alvosAtivosExistem: async () => sobrescritas.alvosAtivos ?? true,
    atualizarControle: async (entrada) => {
      chamadas.atualizacoes.push(entrada);
      return sobrescritas.controleAtualizado ?? true;
    },
    atualizarPolitica: async (entrada) => {
      chamadas.atualizacoes.push(entrada);
      return sobrescritas.politicaAtualizada ?? true;
    },
    criarControle: async (entrada) => {
      chamadas.atualizacoes.push(entrada);
      controleAtual = controle(entrada.codigo, entrada);
    },
    listarControles: async () => (controleAtual === undefined ? [] : [controleAtual]),
    listarPoliticas: async () => [politicaAtual],
    obterContextoControlesUsuario: async () => sobrescritas.contexto,
    obterControle: async () => controleAtual,
    obterPolitica: async () => politicaAtual,
    serializarControle: async () => undefined,
    serializarPolitica: async () => undefined,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      return verificar({}, transacao);
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    servico: new ServicoReleases(repositorio, autorizacao, auditoria),
    transacao: { id: 'transacao-controlada' },
  };
}

test('política semântica distingue atualização obrigatória e recomendada', async () => {
  const cenario = criarCenario();
  const antiga = await cenario.servico.avaliarPoliticaVersao('ANDROID', '1.9.9');
  const minima = await cenario.servico.avaliarPoliticaVersao('ANDROID', '2.0.0');
  const atual = await cenario.servico.avaliarPoliticaVersao('ANDROID', '2.1.0');

  assert.equal(antiga.atualizacaoObrigatoria, true);
  assert.equal(antiga.atualizacaoRecomendada, true);
  assert.equal(minima.atualizacaoObrigatoria, false);
  assert.equal(minima.atualizacaoRecomendada, true);
  assert.equal(atual.atualizacaoRecomendada, false);
  await assert.rejects(
    cenario.servico.exigirVersaoPermitida('ANDROID', '1.0.0'),
    ErroAtualizacaoObrigatoria,
  );
});

test('desligamento emergencial e estados inativos prevalecem sobre alvos', async () => {
  const cenario = criarCenario({
    contexto: {
      controles: [
        controle('ALVO_USUARIO', { usuarioAlvo: true }),
        controle('ALVO_FILA', { filaAlvo: true }),
        controle('ROLLOUT_TOTAL', { percentualLiberacao: 100 }),
        controle('DESLIGADO', { usuarioAlvo: true, desligadoEmergencialmente: true }),
        controle('INATIVO', { usuarioAlvo: true, estado: 'DESATIVADO' }),
      ],
      papelBase: 'ATENDENTE',
      perfilAtivo: true,
      usuarioAtivo: true,
    },
  });

  assert.deepEqual(await cenario.servico.obterControlesUsuario(usuarioId), {
    ALVO_FILA: true,
    ALVO_USUARIO: true,
    DESLIGADO: false,
    INATIVO: false,
    ROLLOUT_TOTAL: true,
  });
});

test('liberação administrativa é explícita e depende de perfil ativo', async () => {
  const base = {
    controles: [controle('ADMIN', { liberarAdministradores: true })],
    papelBase: 'ADMINISTRADOR',
    perfilAtivo: true,
    usuarioAtivo: true,
  };
  const ativa = criarCenario({ contexto: base });
  const inativa = criarCenario({ contexto: { ...base, perfilAtivo: false } });

  assert.equal((await ativa.servico.obterControlesUsuario(usuarioId)).ADMIN, true);
  assert.equal((await inativa.servico.obterControlesUsuario(usuarioId)).ADMIN, false);
});

test('alteração de controle exige permissão, versão otimista e gera auditoria', async () => {
  const cenario = criarCenario();
  const entrada = {
    codigo: 'NOVA_EXPERIENCIA',
    desligadoEmergencialmente: false,
    estado: 'ATIVADO',
    filasAlvo: [filaId],
    liberarAdministradores: true,
    percentualLiberacao: 10,
    usuariosAlvo: [usuarioId],
    versaoEsperada: 0,
  };
  const criada = await cenario.servico.atualizarControle(
    sessao,
    entrada,
    cenario.transacao,
  );

  assert.equal(criada.versao, 1);
  assert.equal(cenario.chamadas.autorizacao[0].permissao, 'ADMINISTRAR_RELEASES');
  assert.equal(cenario.chamadas.auditoria.length, 1);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);

  await assert.rejects(
    cenario.servico.atualizarControle(
      sessao,
      { ...entrada, versaoEsperada: 0 },
      cenario.transacao,
    ),
    ErroConflitoVersaoRelease,
  );
});

test('política rejeita downgrade, loja incorreta e alteração concorrente', async () => {
  const cenario = criarCenario();
  const base = {
    plataforma: 'ANDROID',
    urlLoja: 'https://play.google.com/store/apps/details?id=br.com.vyntra',
    versaoEsperada: 1,
    versaoMinima: '2.0.0',
    versaoRecomendada: '2.1.0',
  };

  await assert.rejects(
    cenario.servico.atualizarPolitica(
      sessao,
      { ...base, versaoRecomendada: '1.9.9' },
      cenario.transacao,
    ),
    ErroConfiguracaoReleaseInvalida,
  );
  await assert.rejects(
    cenario.servico.atualizarPolitica(
      sessao,
      { ...base, urlLoja: 'https://example.com/app' },
      cenario.transacao,
    ),
    ErroConfiguracaoReleaseInvalida,
  );

  const conflito = criarCenario({ politicaAtual: politica({ versao: 2 }) });
  await assert.rejects(
    conflito.servico.atualizarPolitica(sessao, base, conflito.transacao),
    ErroConflitoVersaoRelease,
  );
});
