import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoBuscaGaleriaWeb } from '../dist/console-web/servico-busca-galeria-web.js';

const ids = { atendimento: randomUUID(), conversa: randomUUID(), fila: randomUUID(), mensagem: randomUUID(), sessao: randomUUID(), usuario: randomUUID() };
const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: ids.sessao, usuarioId: ids.usuario };

function cenario(linhas) {
  let autorizou = false;
  const transacao = {
    $queryRaw: async () => { assert.equal(autorizou, true); return linhas; },
    atendimento: {
      findMany: async () => [{ id: ids.atendimento }],
      findUnique: async () => ({ conversaId: ids.conversa, filaAtualId: ids.fila }),
    },
    fila: { findMany: async () => [{ id: ids.fila }] },
  };
  const autorizacao = { autorizar: async () => { autorizou = true; } };
  return new ServicoBuscaGaleriaWeb({ executarLeituraConsistente: async (operacao) => operacao(transacao) }, autorizacao);
}

test('busca autoriza antes da consulta e pagina somente projeção mínima', async () => {
  const servico = cenario([{ atendimento_id: ids.atendimento, conta_nome: 'Suporte', direcao: 'ENTRADA', id: ids.mensagem, ocorrido_em: new Date('2026-09-01T10:00:00Z'), texto: 'segunda via da fatura', tipo: 'TEXTO' }]);
  const pagina = await servico.buscar(sessao, ids.atendimento, 'segunda via');
  assert.equal(pagina.itens[0].trecho, 'segunda via da fatura');
  assert.equal('conteudoProtegido' in pagina.itens[0], false);
});

test('galeria valida filtro e cursor antes do banco', async () => {
  const servico = cenario([]);
  await assert.rejects(servico.listarGaleria(sessao, ids.atendimento, 'OUTRO'), /TIPO_GALERIA_INVALIDO/);
  await assert.rejects(servico.buscar(sessao, ids.atendimento, 'a'), /TERMO_BUSCA_INVALIDO/);
  await assert.rejects(servico.buscar(sessao, ids.atendimento, 'fatura', 'invalido'), /CURSOR_BUSCA_INVALIDO/);
});
