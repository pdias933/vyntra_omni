import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroAlteracaoIdentidadeInvalida } from '../dist/contatos/erros-contato.js';
import { ServicoAlteracaoIdentidadeWhatsApp } from '../dist/contatos/servico-alteracao-identidade-whatsapp.js';

const agora = new Date('2026-08-31T23:00:00.000Z');
const conta = {
  atualizadaEm: agora,
  criadaEm: agora,
  estado: 'ATIVA',
  id: '44444444-4444-4444-8444-444444444441',
  identificadorCanalExterno: 'canal-sintetico',
  nomeExibicao: 'Conta Sintética',
  portfolioEmpresarialExternoId: 'portfolio-sintetico',
  versao: 1,
};

function agregado(identificador, contatoId = randomUUID(), identidadeId = randomUUID()) {
  return {
    contato: { atualizadoEm: agora, criadoEm: agora, estado: 'NORMAL', id: contatoId },
    identidade: {
      atualizadaEm: agora,
      contaWhatsAppUltimaObservacaoId: conta.id,
      contatoId,
      criadaEm: agora,
      id: identidadeId,
      identificadorExternoEstavel: identificador,
      portfolioEmpresarialExternoId: conta.portfolioEmpresarialExternoId,
    },
  };
}

function entrada(sobrescritas = {}) {
  return {
    contaWhatsAppId: conta.id,
    identificadorExternoAnterior: 'identidade-anterior',
    identificadorExternoAtual: 'identidade-atual',
    ...sobrescritas,
  };
}

function cenario({ anterior, atual, destino, eventoCriado = true } = {}) {
  const chamadas = { alteracoes: [], auditoria: [], bloqueios: [], eventos: [], resolucoes: [] };
  const contatos = {
    alterarIdentificadorConfirmado: async (...args) => chamadas.alteracoes.push(args),
    bloquearIdentidade: async (_portfolio, chave) => chamadas.bloqueios.push(chave),
    obterPorIdentificadorEstavel: async (_portfolio, chave) =>
      chave === 'identidade-anterior' ? anterior : atual,
    registrarEventoAlteracao: async (...args) => {
      chamadas.eventos.push(args);
      return eventoCriado;
    },
  };
  const contas = { obterPorId: async () => conta };
  const resolucao = {
    resolver: async (...args) => {
      chamadas.resolucoes.push(args);
      return { ...destino, criada: true };
    },
  };
  const auditoria = { registrar: async (...args) => chamadas.auditoria.push(args) };
  return {
    chamadas,
    servico: new ServicoAlteracaoIdentidadeWhatsApp(
      contatos,
      contas,
      resolucao,
      auditoria,
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('evento confirmado troca identificador e preserva contato', async () => {
  const anterior = agregado('identidade-anterior');
  const caso = cenario({ anterior });
  const resultado = await caso.servico.processar(
    entrada({ nomeUsuarioAtual: '  usuario-atual  ' }),
    caso.transacao,
    () => agora,
  );
  assert.equal(resultado.resultado, 'PRESERVADA');
  assert.equal(resultado.contato.id, anterior.contato.id);
  assert.equal(resultado.identidade.identificadorExternoEstavel, 'identidade-atual');
  assert.equal(resultado.identidade.nomeUsuario, 'usuario-atual');
  assert.equal(caso.chamadas.alteracoes.length, 1);
  assert.deepEqual(caso.chamadas.bloqueios, ['identidade-anterior', 'identidade-atual']);
  assert.equal(caso.chamadas.auditoria[0][1], caso.transacao);
});

test('replay anterior→atual pelo alias é idempotente', async () => {
  const atual = agregado('identidade-atual');
  const caso = cenario({ anterior: atual, atual });
  const resultado = await caso.servico.processar(entrada(), caso.transacao);
  assert.equal(resultado.resultado, 'PRESERVADA');
  assert.equal(resultado.eventoCriado, false);
  assert.equal(caso.chamadas.alteracoes.length, 0);
  assert.equal(caso.chamadas.auditoria.length, 0);
});

test('origem desconhecida cria contato separado sem merge automático', async () => {
  const destino = agregado('identidade-atual');
  const caso = cenario({ destino });
  const resultado = await caso.servico.processar(entrada(), caso.transacao);
  assert.equal(resultado.resultado, 'SEPARADA_INCERTA');
  assert.equal(resultado.contato.id, destino.contato.id);
  assert.equal(caso.chamadas.resolucoes.length, 1);
  assert.equal(caso.chamadas.alteracoes.length, 0);
  assert.equal(caso.chamadas.eventos.length, 1);
});

test('conflito entre dois contatos mantém o destino separado', async () => {
  const anterior = agregado('identidade-anterior');
  const atual = agregado('identidade-atual');
  const caso = cenario({ anterior, atual });
  const resultado = await caso.servico.processar(entrada(), caso.transacao);
  assert.equal(resultado.resultado, 'SEPARADA_INCERTA');
  assert.equal(resultado.contato.id, atual.contato.id);
  assert.notEqual(resultado.contato.id, anterior.contato.id);
  assert.equal(caso.chamadas.alteracoes.length, 0);
});

test('evento incerto repetido não audita novamente', async () => {
  const atual = agregado('identidade-atual');
  const caso = cenario({ atual, eventoCriado: false });
  const resultado = await caso.servico.processar(entrada(), caso.transacao);
  assert.equal(resultado.eventoCriado, false);
  assert.equal(caso.chamadas.auditoria.length, 0);
});

test('par igual é inválido antes de qualquer lock', async () => {
  const caso = cenario();
  await assert.rejects(
    caso.servico.processar(
      entrada({ identificadorExternoAtual: 'identidade-anterior' }),
      caso.transacao,
    ),
    ErroAlteracaoIdentidadeInvalida,
  );
  assert.equal(caso.chamadas.bloqueios.length, 0);
});
