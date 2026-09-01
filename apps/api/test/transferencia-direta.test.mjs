import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroDestinatarioTransferenciaIndisponivel } from '../dist/atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ServicoAtribuicoesAtendimento } from '../dist/atribuicoes-atendimento/servico-atribuicoes-atendimento.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  destinatario: randomUUID(),
  filaDestino: randomUUID(),
  filaOrigem: randomUUID(),
  remetente: randomUUID(),
  sessao: randomUUID(),
};
const base = {
  atualizadoEm: new Date('2026-09-01T14:00:00.000Z'),
  contaWhatsAppOrigemId: ids.conta,
  conversaId: ids.conversa,
  estado: 'EM_ATENDIMENTO',
  filaAtualId: ids.filaOrigem,
  id: ids.atendimento,
  iniciadoEm: new Date('2026-09-01T13:00:00.000Z'),
  modo: 'HUMANO',
  motivoEspera: 'NENHUM',
  usuarioResponsavelId: ids.remetente,
  versaoAtribuicao: 8,
  versaoEstado: 7,
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.remetente,
};
const agora = new Date('2026-09-01T15:00:00.000Z');

function cenario(opcoes = {}) {
  const chamadas = { auditoria: [], autorizacao: [], destinatario: [], eventos: [], historico: [] };
  let consultasDisponibilidade = 0;
  const repositorio = {
    destinatarioEstaDisponivel: async () => {
      consultasDisponibilidade += 1;
      return opcoes.disponibilidadeDepois === false && consultasDisponibilidade > 1
        ? false
        : opcoes.disponivel ?? true;
    },
    obter: async () => ({ ...base }),
    transferirParaUsuarioCondicional: async () => opcoes.alterou ?? true,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      const resultado = await verificar({}, transacao);
      if (!resultado.acessivel || !resultado.estadoPermiteAcao) throw new Error('NEGADO');
    },
    autorizarUsuario: async (...args) => chamadas.destinatario.push(args),
  };
  const historico = { substituir: async (...args) => chamadas.historico.push(args) };
  const eventos = { acrescentar: async (...args) => chamadas.eventos.push(args) };
  const auditoria = { registrar: async (...args) => chamadas.auditoria.push(args) };
  return {
    chamadas,
    servico: new ServicoAtribuicoesAtendimento(repositorio, autorizacao, historico, eventos, auditoria),
  };
}

test('transferência direta atribui imediatamente sem etapa de aceite', async () => {
  const x = cenario();
  const resultado = await x.servico.transferirParaUsuario(
    sessao,
    ids.atendimento,
    ids.filaDestino,
    ids.destinatario,
    8,
    {},
    () => agora,
  );
  assert.equal(resultado.estado, 'EM_ATENDIMENTO');
  assert.equal(resultado.modo, 'HUMANO');
  assert.equal(resultado.usuarioResponsavelId, ids.destinatario);
  assert.equal(resultado.filaAtualId, ids.filaDestino);
  assert.equal(resultado.versaoAtribuicao, 9);
  assert.equal(x.chamadas.historico[0][1].tipo, 'TRANSFERENCIA_USUARIO');
  assert.equal(x.chamadas.eventos[0][0].tipo, 'ATENDIMENTO_TRANSFERIDO_PARA_USUARIO');
});

test('destinatário exige fila explícita, disponibilidade, acesso e RECEBER_TRANSFERENCIA', async () => {
  const x = cenario();
  await x.servico.transferirParaUsuario(sessao, ids.atendimento, ids.filaDestino, ids.destinatario, 8, {}, () => agora);
  assert.equal(x.chamadas.destinatario.length, 1);
  assert.deepEqual(x.chamadas.destinatario[0][0], {
    filaId: ids.filaDestino,
    permissao: 'RECEBER_TRANSFERENCIA',
    usuarioId: ids.destinatario,
  });
  assert.deepEqual(x.chamadas.autorizacao.map(({ filaId }) => filaId), [ids.filaOrigem, ids.filaDestino]);
});

test('destinatário indisponível falha antes de qualquer efeito', async () => {
  const x = cenario({ disponivel: false });
  await assert.rejects(
    x.servico.transferirParaUsuario(
      sessao,
      ids.atendimento,
      ids.filaDestino,
      ids.destinatario,
      8,
      {},
      () => agora,
    ),
    ErroDestinatarioTransferenciaIndisponivel,
  );
  assert.equal(x.chamadas.historico.length, 0);
  assert.equal(x.chamadas.eventos.length, 0);
  assert.equal(x.chamadas.auditoria.length, 0);
});

test('mudança concorrente para indisponível é revalidada pela escrita condicional', async () => {
  const x = cenario({ alterou: false, disponibilidadeDepois: false });
  await assert.rejects(
    x.servico.transferirParaUsuario(
      sessao,
      ids.atendimento,
      ids.filaDestino,
      ids.destinatario,
      8,
      {},
      () => agora,
    ),
    ErroDestinatarioTransferenciaIndisponivel,
  );
  assert.equal(x.chamadas.historico.length, 0);
});
