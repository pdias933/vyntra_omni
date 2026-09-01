import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoAdministracaoOperacional } from '../dist/administracao-operacional/servico-administracao-operacional.js';

const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: randomUUID(), usuarioId: randomUUID() };

test('painel resolve capacidades antes dos dados e não declara adapters ausentes como ativos', async () => {
  let autorizacoes = 0;
  const transacao = {
    calendarioAtendimento: { findMany: async () => { assert.equal(autorizacoes, 3); return []; } },
    contaWhatsApp: { findMany: async () => { assert.equal(autorizacoes, 3); return []; } },
    fila: { findMany: async () => { assert.equal(autorizacoes, 3); return []; } },
  };
  const servico = new ServicoAdministracaoOperacional(
    { executarLeituraConsistente: async (operacao) => operacao(transacao) },
    { autorizar: async () => { autorizacoes += 1; } },
  );
  const painel = await servico.listar(sessao);
  assert.equal(painel.integracoes.find(({ codigo }) => codigo === 'POSTGRESQL').estado, 'ATIVA');
  assert.equal(painel.integracoes.find(({ codigo }) => codigo === 'CANAL_WHATSAPP').estado, 'NAO_CONFIGURADA');
  assert.equal(painel.integracoes.find(({ codigo }) => codigo === 'SISTEMA_GESTAO').estado, 'NAO_CONFIGURADA');
});
