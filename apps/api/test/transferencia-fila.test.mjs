import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroConflitoTransferenciaAtendimento } from '../dist/atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ServicoAtribuicoesAtendimento } from '../dist/atribuicoes-atendimento/servico-atribuicoes-atendimento.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  contexto: randomUUID(),
  conversa: randomUUID(),
  filaDestino: randomUUID(),
  filaOrigem: randomUUID(),
  protocolo: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
};
const agora = new Date('2026-09-01T14:00:00.000Z');
const base = {
  atualizadoEm: new Date('2026-09-01T13:00:00.000Z'),
  contaWhatsAppOrigemId: ids.conta,
  contextoPreservado: ids.contexto,
  conversaId: ids.conversa,
  estado: 'EM_ATENDIMENTO',
  filaAtualId: ids.filaOrigem,
  id: ids.atendimento,
  iniciadoEm: new Date('2026-09-01T12:00:00.000Z'),
  modo: 'HUMANO',
  motivoEspera: 'NENHUM',
  protocoloPreservado: ids.protocolo,
  timelinePreservada: ids.conversa,
  usuarioResponsavelId: ids.usuario,
  versaoAtribuicao: 5,
  versaoEstado: 4,
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function cenario(opcoes = {}) {
  let atual = { ...base };
  const chamadas = { auditoria: [], autorizacao: [], eventos: [], historico: [] };
  const repositorio = {
    obter: async () => ({ ...atual }),
    transferirParaFilaCondicional: async (proximo, filaOrigem, versao) => {
      if (
        opcoes.conflito ||
        atual.filaAtualId !== filaOrigem ||
        atual.versaoAtribuicao !== versao
      ) return false;
      atual = { ...proximo };
      return true;
    },
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      const resultado = await verificar({}, transacao);
      if (!resultado.acessivel || !resultado.estadoPermiteAcao) throw new Error('NEGADO');
      return {};
    },
  };
  const historico = { substituir: async (...args) => chamadas.historico.push(args) };
  const eventos = { acrescentar: async (...args) => chamadas.eventos.push(args) };
  const auditoria = { registrar: async (...args) => chamadas.auditoria.push(args) };
  return {
    chamadas,
    servico: new ServicoAtribuicoesAtendimento(repositorio, autorizacao, historico, eventos, auditoria),
  };
}

test('transferência para fila limpa responsável e preserva protocolo, conversa, origem e contexto', async () => {
  const x = cenario();
  const resultado = await x.servico.transferirParaFila(
    sessao,
    ids.atendimento,
    ids.filaDestino,
    5,
    {},
    () => agora,
  );
  assert.equal(resultado.estado, 'AGUARDANDO');
  assert.equal(resultado.modo, 'FILA_HUMANA');
  assert.equal(resultado.motivoEspera, 'AGUARDANDO_HUMANO');
  assert.equal(resultado.usuarioResponsavelId, undefined);
  assert.equal(resultado.versaoAtribuicao, 6);
  assert.equal(resultado.conversaId, ids.conversa);
  assert.equal(resultado.contaWhatsAppOrigemId, ids.conta);
  assert.equal(resultado.protocoloPreservado, ids.protocolo);
  assert.equal(resultado.contextoPreservado, ids.contexto);
  assert.equal(resultado.timelinePreservada, ids.conversa);
});

test('origem e destino exigem capacidade e acesso de transferência', async () => {
  const x = cenario();
  await x.servico.transferirParaFila(sessao, ids.atendimento, ids.filaDestino, 5, {}, () => agora);
  assert.deepEqual(
    x.chamadas.autorizacao.map(({ filaId, permissao }) => ({ filaId, permissao })),
    [
      { filaId: ids.filaOrigem, permissao: 'TRANSFERIR_ATENDIMENTO' },
      { filaId: ids.filaDestino, permissao: 'TRANSFERIR_ATENDIMENTO' },
    ],
  );
});

test('conflito condicional não cria histórico, evento ou auditoria', async () => {
  const x = cenario({ conflito: true });
  await assert.rejects(
    x.servico.transferirParaFila(sessao, ids.atendimento, ids.filaDestino, 5, {}, () => agora),
    ErroConflitoTransferenciaAtendimento,
  );
  assert.equal(x.chamadas.historico.length, 0);
  assert.equal(x.chamadas.eventos.length, 0);
  assert.equal(x.chamadas.auditoria.length, 0);
});

test('histórico, evento e auditoria descrevem transferência para fila na mesma transação', async () => {
  const x = cenario();
  const transacao = {};
  await x.servico.transferirParaFila(sessao, ids.atendimento, ids.filaDestino, 5, transacao, () => agora);
  assert.equal(x.chamadas.historico[0][1].tipo, 'TRANSFERENCIA_FILA');
  assert.equal(x.chamadas.historico[0][2], transacao);
  assert.equal(x.chamadas.eventos[0][0].tipo, 'ATENDIMENTO_TRANSFERIDO_PARA_FILA');
  assert.equal(x.chamadas.eventos[0][1], transacao);
  assert.equal(x.chamadas.auditoria[0][1], transacao);
});
