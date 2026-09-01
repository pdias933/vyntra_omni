import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoVersaoFluxo,
  ErroFluxoDuplicado,
  ErroFluxoInvalido,
  ErroVersaoFluxoNaoEditavel,
  ErroVersaoPublicadaIndisponivel,
} from '../dist/fluxos/erros-fluxo.js';
import { ServicoCatalogoFluxos } from '../dist/fluxos/servico-catalogo-fluxos.js';

const agora = new Date('2026-09-01T14:00:00.000Z');
const ids = {
  fluxo: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
  versao: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function fluxo(sobrescritas = {}) {
  return {
    ativo: true,
    atualizadoEm: agora,
    criadoEm: agora,
    criadoPorUsuarioId: ids.usuario,
    id: ids.fluxo,
    nome: 'Cobrança preventiva',
    nomeNormalizado: 'cobranca-preventiva',
    revisao: 1,
    tipo: 'FINANCEIRO',
    ...sobrescritas,
  };
}

function versao(sobrescritas = {}) {
  return {
    atualizadaEm: agora,
    criadaEm: agora,
    criadaPorUsuarioId: ids.usuario,
    definicao: { inicio: 'entrada', nos: [] },
    estado: 'RASCUNHO',
    fluxoId: ids.fluxo,
    id: ids.versao,
    numeroVersao: 1,
    revisao: 1,
    versaoSchemaDefinicao: 1,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    alteracoes: [],
    auditoria: [],
    autorizacao: [],
    bloqueios: [],
    criacoesFluxo: [],
    criacoesVersao: [],
  };
  const repositorio = {
    alterarRascunho: async (...argumentos) => {
      chamadas.alteracoes.push(argumentos);
      return sobrescritas.alterada ?? true;
    },
    bloquearFluxo: async (...argumentos) =>
      chamadas.bloqueios.push(['FLUXO', ...argumentos]),
    bloquearNome: async (...argumentos) =>
      chamadas.bloqueios.push(['NOME', ...argumentos]),
    bloquearVersao: async (...argumentos) =>
      chamadas.bloqueios.push(['VERSAO', ...argumentos]),
    criarFluxo: async (...argumentos) => {
      chamadas.criacoesFluxo.push(argumentos);
      return sobrescritas.fluxoCriado ?? true;
    },
    criarVersao: async (...argumentos) => {
      chamadas.criacoesVersao.push(argumentos);
      return sobrescritas.versaoCriada ?? true;
    },
    obterFluxo: async () => sobrescritas.fluxo ?? fluxo(),
    obterProximoNumeroVersao: async () => sobrescritas.proximoNumero ?? 2,
    obterVersao: async () => sobrescritas.versao ?? versao(),
    obterVersaoPublicada: async () => sobrescritas.publicada,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push([entrada, transacao]);
      return { ...(await verificar({}, transacao)), permissao: entrada.permissao };
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    servico: new ServicoCatalogoFluxos(repositorio, autorizacao, auditoria),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('cria fluxo e versão inicial rascunho na mesma transação', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.criarFluxo(
    sessao,
    {
      definicaoInicial: { inicio: 'entrada', nos: [] },
      descricao: '  Lembrete   antes do vencimento ',
      nome: '  Cobrança   Preventiva ',
      tipo: 'FINANCEIRO',
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.fluxo.nome, 'Cobrança Preventiva');
  assert.equal(resultado.fluxo.nomeNormalizado, 'cobranca-preventiva');
  assert.equal(resultado.fluxo.descricao, 'Lembrete antes do vencimento');
  assert.equal(resultado.versao.estado, 'RASCUNHO');
  assert.equal(resultado.versao.numeroVersao, 1);
  assert.equal(resultado.versao.fluxoId, resultado.fluxo.id);
  assert.equal(cenario.chamadas.autorizacao[0][0].permissao, 'EDITAR_FLUXO');
  assert.equal(cenario.chamadas.criacoesFluxo[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.criacoesVersao[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][0].dadosNovos.definicao, undefined);
});

test('nome duplicado interrompe antes da versão e não audita', async () => {
  const cenario = criarCenario({ fluxoCriado: false });
  await assert.rejects(
    cenario.servico.criarFluxo(
      sessao,
      {
        definicaoInicial: { inicio: 'entrada' },
        nome: 'Cobrança',
        tipo: 'FINANCEIRO',
      },
      cenario.transacao,
    ),
    ErroFluxoDuplicado,
  );
  assert.equal(cenario.chamadas.criacoesVersao.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('numera nova versão sob bloqueio do fluxo e mantém rascunho', async () => {
  const cenario = criarCenario({ proximoNumero: 7 });
  const criada = await cenario.servico.criarVersaoRascunho(
    sessao,
    {
      definicao: { inicio: 'entrada-v7', nos: [] },
      fluxoId: ids.fluxo,
      versaoSchemaDefinicao: 2,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(criada.numeroVersao, 7);
  assert.equal(criada.estado, 'RASCUNHO');
  assert.equal(criada.versaoSchemaDefinicao, 2);
  assert.equal(cenario.chamadas.bloqueios[0][0], 'FLUXO');
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'VERSAO_FLUXO_CRIADA');
});

test('altera somente rascunho com revisão otimista', async () => {
  const cenario = criarCenario();
  const alterada = await cenario.servico.alterarDefinicaoRascunho(
    sessao,
    {
      definicao: { inicio: 'novo', nos: [{ id: 'novo' }] },
      revisaoEsperada: 1,
      versaoFluxoId: ids.versao,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(alterada.revisao, 2);
  assert.deepEqual(alterada.definicao, {
    inicio: 'novo',
    nos: [{ id: 'novo' }],
  });
  assert.equal(cenario.chamadas.alteracoes[0][1], 1);

  const concorrente = criarCenario({ versao: versao({ revisao: 2 }) });
  await assert.rejects(
    concorrente.servico.alterarDefinicaoRascunho(
      sessao,
      {
        definicao: { inicio: 'outro' },
        revisaoEsperada: 1,
        versaoFluxoId: ids.versao,
      },
      concorrente.transacao,
    ),
    ErroConflitoVersaoFluxo,
  );
  assert.equal(concorrente.chamadas.alteracoes.length, 0);
});

test('versão publicada ou arquivada é imutável pelo catálogo', async () => {
  for (const estado of ['PUBLICADA', 'ARQUIVADA', 'EM_TESTE']) {
    const cenario = criarCenario({ versao: versao({ estado }) });
    await assert.rejects(
      cenario.servico.alterarDefinicaoRascunho(
        sessao,
        {
          definicao: { inicio: 'indevido' },
          revisaoEsperada: 1,
          versaoFluxoId: ids.versao,
        },
        cenario.transacao,
      ),
      ErroVersaoFluxoNaoEditavel,
    );
    assert.equal(cenario.chamadas.alteracoes.length, 0);
    assert.equal(cenario.chamadas.auditoria.length, 0);
  }
});

test('rejeita definição não JSON, profunda ou maior que o limite', async () => {
  const invalidas = [
    [],
    'texto',
    { numero: Number.NaN },
    { ausente: undefined },
    { grande: 'a'.repeat(262_145) },
  ];
  for (const definicaoInicial of invalidas) {
    const cenario = criarCenario();
    await assert.rejects(
      cenario.servico.criarFluxo(
        sessao,
        { definicaoInicial, nome: 'Fluxo', tipo: 'OUTRO' },
        cenario.transacao,
      ),
      ErroFluxoInvalido,
    );
    assert.equal(cenario.chamadas.autorizacao.length, 0);
  }
});

test('seleção para nova execução devolve exatamente a versão apontada', async () => {
  const publicada = versao({
    estado: 'PUBLICADA',
    numeroVersao: 3,
    publicadaEm: agora,
    publicadaPorUsuarioId: ids.usuario,
  });
  const cenario = criarCenario({ publicada });
  assert.equal(
    await cenario.servico.obterVersaoPublicadaParaNovaExecucao(
      ids.fluxo,
      cenario.transacao,
    ),
    publicada,
  );
  assert.equal(cenario.chamadas.bloqueios[0][0], 'FLUXO');
  const ausente = criarCenario();
  await assert.rejects(
    ausente.servico.obterVersaoPublicadaParaNovaExecucao(
      ids.fluxo,
      ausente.transacao,
    ),
    ErroVersaoPublicadaIndisponivel,
  );
});
