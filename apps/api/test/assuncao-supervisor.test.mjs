import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ErroConflitoAssuncaoAtendimento } from '../dist/atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ServicoAtribuicoesAtendimento } from '../dist/atribuicoes-atendimento/servico-atribuicoes-atendimento.js';

const ids = {
  atendimento: randomUUID(),
  atendente: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  sessao: randomUUID(),
  supervisor: randomUUID(),
};
const agora = new Date('2026-09-01T16:00:00.000Z');
const base = {
  atualizadoEm: new Date('2026-09-01T15:00:00.000Z'),
  contaWhatsAppOrigemId: ids.conta,
  conversaId: ids.conversa,
  estado: 'EM_ATENDIMENTO',
  filaAtualId: ids.fila,
  id: ids.atendimento,
  iniciadoEm: new Date('2026-09-01T14:00:00.000Z'),
  modo: 'HUMANO',
  motivoEspera: 'NENHUM',
  usuarioResponsavelId: ids.atendente,
  versaoAtribuicao: 11,
  versaoEstado: 10,
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.supervisor,
};

function cenario(opcoes = {}) {
  let atual = { ...base };
  const chamadas = { auditoria: [], autorizacao: [], eventos: [], historico: [] };
  const repositorio = {
    bloquearAutoridadeSaida: async () => {},
    assumirCondicional: async (proximo, fila, responsavel, versao) => {
      if (
        opcoes.conflito ||
        atual.filaAtualId !== fila ||
        atual.usuarioResponsavelId !== responsavel ||
        atual.versaoAtribuicao !== versao
      ) return false;
      atual = { ...proximo };
      return true;
    },
    obter: async () => ({ ...atual }),
    usuarioTemAutoridadeAtual: async (_atendimento, usuario, versao) =>
      atual.estado === 'EM_ATENDIMENTO' &&
      atual.usuarioResponsavelId === usuario &&
      atual.versaoAtribuicao === versao,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      const recurso = await verificar({}, transacao);
      if (!recurso.acessivel || !recurso.estadoPermiteAcao) throw new Error('NEGADO');
      return { papelBase: opcoes.papelBase ?? 'SUPERVISOR' };
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

test('supervisor assume atendimento no escopo da fila', async () => {
  const x = cenario();
  const resultado = await x.servico.assumirComoSupervisor(
    sessao,
    ids.atendimento,
    11,
    {},
    () => agora,
  );
  assert.equal(resultado.usuarioResponsavelId, ids.supervisor);
  assert.equal(resultado.versaoAtribuicao, 12);
  assert.equal(x.chamadas.autorizacao[0].permissao, 'ASSUMIR_ATENDIMENTO');
  assert.equal(x.chamadas.autorizacao[0].filaId, ids.fila);
});

test('administrador pode assumir e atendente continua proibido', async () => {
  await cenario({ papelBase: 'ADMINISTRADOR' }).servico.assumirComoSupervisor(
    sessao,
    ids.atendimento,
    11,
    {},
    () => agora,
  );
  await assert.rejects(
    cenario({ papelBase: 'ATENDENTE' }).servico.assumirComoSupervisor(
      sessao,
      ids.atendimento,
      11,
      {},
      () => agora,
    ),
    ErroPermissaoNegada,
  );
});

test('responsável anterior perde autoridade imediatamente após a troca', async () => {
  const x = cenario();
  assert.equal(
    await x.servico.possuiAutoridadeAtual(ids.atendimento, ids.atendente, 11, {}),
    true,
  );
  await x.servico.assumirComoSupervisor(sessao, ids.atendimento, 11, {}, () => agora);
  assert.equal(
    await x.servico.possuiAutoridadeAtual(ids.atendimento, ids.atendente, 11, {}),
    false,
  );
  assert.equal(
    await x.servico.possuiAutoridadeAtual(ids.atendimento, ids.supervisor, 12, {}),
    true,
  );
});

test('assunção registra histórico, evento e auditoria somente após escrita condicional', async () => {
  const x = cenario();
  const transacao = {};
  await x.servico.assumirComoSupervisor(sessao, ids.atendimento, 11, transacao, () => agora);
  assert.equal(x.chamadas.historico[0][1].tipo, 'ASSUNCAO_SUPERVISOR');
  assert.equal(x.chamadas.historico[0][2], transacao);
  assert.equal(x.chamadas.eventos[0][0].tipo, 'ATENDIMENTO_ASSUMIDO_POR_SUPERVISOR');
  assert.equal(x.chamadas.auditoria[0][1], transacao);

  const conflito = cenario({ conflito: true });
  await assert.rejects(
    conflito.servico.assumirComoSupervisor(sessao, ids.atendimento, 11, {}, () => agora),
    ErroConflitoAssuncaoAtendimento,
  );
  assert.equal(conflito.chamadas.historico.length, 0);
});
