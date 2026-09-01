import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroConflitoResgateAtendimento } from '../dist/atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ServicoAtribuicoesAtendimento } from '../dist/atribuicoes-atendimento/servico-atribuicoes-atendimento.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  sessaoA: randomUUID(),
  sessaoB: randomUUID(),
  usuarioA: randomUUID(),
  usuarioB: randomUUID(),
};
const agora = new Date('2026-09-01T13:00:00.000Z');
const base = {
  atualizadoEm: new Date('2026-09-01T12:00:00.000Z'),
  contaWhatsAppOrigemId: ids.conta,
  conversaId: ids.conversa,
  estado: 'AGUARDANDO',
  filaAtualId: ids.fila,
  id: ids.atendimento,
  iniciadoEm: new Date('2026-09-01T12:00:00.000Z'),
  modo: 'FILA_HUMANA',
  motivoEspera: 'AGUARDANDO_HUMANO',
  versaoAtribuicao: 3,
  versaoEstado: 2,
};

function sessao(usuarioId, sessaoId) {
  return {
    estado: 'ATIVA',
    expiraEm: new Date('2099-01-01T00:00:00.000Z'),
    sessaoId,
    usuarioId,
  };
}

function cenario() {
  let atual = { ...base };
  const chamadas = {
    auditoria: [],
    autorizacao: [],
    eventos: [],
    historico: [],
  };
  const repositorio = {
    bloquearAutoridadeSaida: async () => {},
    cancelarMensagensAutomaticasNaFila: async () => 2,
    obter: async () => ({ ...atual }),
    resgatarCondicional: async (proximo, filaEsperada, versaoEsperada) => {
      if (
        atual.estado !== 'AGUARDANDO' ||
        atual.filaAtualId !== filaEsperada ||
        atual.usuarioResponsavelId !== undefined ||
        atual.versaoAtribuicao !== versaoEsperada
      ) {
        return false;
      }
      atual = { ...proximo };
      return true;
    },
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      const recurso = await verificar({}, transacao);
      if (!recurso.acessivel || !recurso.estadoPermiteAcao) throw new Error('NEGADO');
      return {};
    },
  };
  const historico = {
    substituir: async (...args) => chamadas.historico.push(args),
  };
  const eventos = {
    acrescentar: async (...args) => chamadas.eventos.push(args),
  };
  const auditoria = {
    registrar: async (...args) => chamadas.auditoria.push(args),
  };
  return {
    chamadas,
    obterAtual: () => atual,
    servico: new ServicoAtribuicoesAtendimento(
      repositorio,
      autorizacao,
      historico,
      eventos,
      auditoria,
    ),
  };
}

test('dois resgates concorrentes produzem exatamente um vencedor', async () => {
  const x = cenario();
  const resultados = await Promise.allSettled([
    x.servico.resgatar(
      sessao(ids.usuarioA, ids.sessaoA),
      ids.atendimento,
      ids.fila,
      3,
      {},
      () => agora,
    ),
    x.servico.resgatar(
      sessao(ids.usuarioB, ids.sessaoB),
      ids.atendimento,
      ids.fila,
      3,
      {},
      () => agora,
    ),
  ]);
  const ganhos = resultados.filter(({ status }) => status === 'fulfilled');
  const perdas = resultados.filter(({ status }) => status === 'rejected');
  assert.equal(ganhos.length, 1);
  assert.equal(perdas.length, 1);
  assert.ok(perdas[0].reason instanceof ErroConflitoResgateAtendimento);
  assert.equal(
    perdas[0].reason.usuarioResponsavelVencedorId,
    x.obterAtual().usuarioResponsavelId,
  );
  assert.equal(x.obterAtual().versaoAtribuicao, 4);
  assert.equal(x.chamadas.historico.length, 1);
  assert.equal(x.chamadas.eventos.length, 1);
  assert.equal(x.chamadas.auditoria.length, 1);
  assert.equal(
    x.chamadas.eventos[0][0].dados.mensagensAutomaticasCanceladas,
    2,
  );
});

test('resgate exige visualização e capacidade de resgatar na fila esperada', async () => {
  const x = cenario();
  await x.servico.resgatar(
    sessao(ids.usuarioA, ids.sessaoA),
    ids.atendimento,
    ids.fila,
    3,
    {},
    () => agora,
  );
  assert.deepEqual(
    x.chamadas.autorizacao.map(({ permissao }) => permissao),
    ['VISUALIZAR_FILA', 'RESGATAR_ATENDIMENTO'],
  );
  assert.ok(x.chamadas.autorizacao.every(({ filaId }) => filaId === ids.fila));
});

test('versão obsoleta retorna conflito com o responsável vencedor', async () => {
  const x = cenario();
  await x.servico.resgatar(
    sessao(ids.usuarioA, ids.sessaoA),
    ids.atendimento,
    ids.fila,
    3,
    {},
    () => agora,
  );
  await assert.rejects(
    x.servico.resgatar(
      sessao(ids.usuarioB, ids.sessaoB),
      ids.atendimento,
      ids.fila,
      3,
      {},
    ),
    (erro) =>
      erro instanceof ErroConflitoResgateAtendimento &&
      erro.usuarioResponsavelVencedorId === ids.usuarioA,
  );
});

test('histórico, evento e auditoria recebem a mesma transação do resgate', async () => {
  const x = cenario();
  const transacao = {};
  await x.servico.resgatar(
    sessao(ids.usuarioA, ids.sessaoA),
    ids.atendimento,
    ids.fila,
    3,
    transacao,
    () => agora,
  );
  assert.equal(x.chamadas.historico[0][2], transacao);
  assert.equal(x.chamadas.eventos[0][1], transacao);
  assert.equal(x.chamadas.auditoria[0][1], transacao);
  assert.equal(x.chamadas.eventos[0][0].tipo, 'ATENDIMENTO_RESGATADO');
});
