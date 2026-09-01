import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ServicoContatoAcoesWeb } from '../dist/console-web/servico-contato-acoes-web.js';

const ids = { atendimento: randomUUID(), contato: randomUUID(), contrato: randomUUID(), conversa: randomUUID(), fila: randomUUID(), sessao: randomUUID(), usuario: randomUUID() };
const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: ids.sessao, usuarioId: ids.usuario };

function criarServico({ negarSensivel = false } = {}) {
  let autorizou = false;
  const transacao = {
    atendimento: { count: async () => 2, findUnique: async () => ({ conversa: { contatoId: ids.contato }, conversaId: ids.conversa, filaAtualId: ids.fila }) },
    contextoAtendimento: { findUnique: async () => ({ contratoExternoAtivoId: 'contrato-erp' }) },
    contato: { findUnique: async () => {
      assert.equal(autorizou, true);
      return { estado: 'IDENTIFICADO', id: ids.contato, identidadesWhatsApp: [{ atualizadaEm: new Date(), identificadorExternoEstavel: 'bsuid-secreto', nomePerfil: 'João', nomeUsuario: 'joao', telefoneE164: '+5527999999999' }], nomeExibicao: 'João', vinculosCliente: [] };
    } },
    midiaMensagem: { count: async () => 1 }, notaInterna: { count: async () => 1 }, ordemServicoErp: { count: async () => 0 },
    protocoloErp: { findUnique: async () => null },
  };
  const autorizacao = { autorizar: async (entrada) => {
    autorizou = true;
    if (negarSensivel && entrada.permissao === 'VISUALIZAR_DADO_SENSIVEL') throw new ErroPermissaoNegada();
  } };
  return new ServicoContatoAcoesWeb(
    { executarLeituraConsistente: async (operacao) => operacao(transacao) },
    autorizacao,
    {}, {}, {}, {}, {},
  );
}

test('detalhes autorizam antes do conteúdo e não projetam BSUID sem permissão', async () => {
  const detalhes = await criarServico({ negarSensivel: true }).obterDetalhes(sessao, ids.atendimento);
  assert.equal(detalhes.nomeExibicao, 'João');
  assert.equal(detalhes.identidades[0].telefoneMascarado, '+55 ••••••-9999');
  assert.equal(detalhes.identidades[0].bsuid, undefined);
});

test('financeiro sem adaptador declara indisponibilidade e nunca usa snapshot', async () => {
  const resultado = await criarServico().consultarFinanceiro(sessao, ids.atendimento);
  assert.deepEqual(resultado, { codigo: 'ERP_NAO_CONFIGURADO', faturas: [], origem: 'INDISPONIVEL' });
});
