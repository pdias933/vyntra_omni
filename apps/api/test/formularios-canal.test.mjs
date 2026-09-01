import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ProjetorSubmissaoFormulario } from '../dist/formularios/projetor-submissao-formulario.js';
import { normalizarSubmissaoFlowMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/formularios-meta-cloud.js';

const formulario = {
  campos: [
    { chave: 'nome', classificacao: 'PESSOAL', rotulo: 'Nome' },
    { chave: 'cpf', classificacao: 'SENSIVEL', rotulo: 'CPF' },
  ],
  contaWhatsAppId: randomUUID(), finalidade: 'IDENTIFICACAO', id: randomUUID(), nome: 'Identificação',
};

function submissao(dadosProtegidos) {
  return {
    contatoId: randomUUID(), dadosHash: 'a'.repeat(64), dadosProtegidos,
    formularioId: formulario.id, formularioReferenciaCanal: 'flow-1', id: randomUUID(),
    mensagemId: randomUUID(), recebidaEm: new Date('2026-09-01T12:00:00Z'), referenciaCanal: 'b'.repeat(64),
  };
}

test('adapter normaliza submissão e nunca preserva token do Flow', () => {
  const token = 'token-flow-secreto-050';
  const normalizada = normalizarSubmissaoFlowMetaCloud({ flow_id: 'flow-1', flow_token: token, response_json: '{"nome":"João","cpf":"12345678900"}' });
  assert.equal(normalizada.formularioReferenciaCanal, 'flow-1');
  assert.equal(normalizada.referenciaCanal.length, 64);
  assert.equal(JSON.stringify(normalizada).includes(token), false);
});

test('timeline projeta card estruturado e mascara sensível sem permissão', () => {
  const card = new ProjetorSubmissaoFormulario().projetar(
    formulario, submissao({ nome: 'João', cpf: '12345678900', ignorado: { bruto: true } }), false, 50n,
  );
  assert.equal(card.acao, 'VER_FORMULARIO');
  assert.equal(card.visibilidade, 'SOMENTE_EQUIPE');
  assert.deepEqual(card.camposMascarados, { CPF: '••••00', Nome: 'João' });
  assert.equal('dadosProtegidos' in card, false);
});

test('permissão revela campo sensível e conteúdo não declarado nunca entra no card', () => {
  const card = new ProjetorSubmissaoFormulario().projetar(
    formulario, submissao({ nome: 'João', cpf: '12345678900', segredoExtra: 'não projetar' }), true, 51n,
  );
  assert.equal(card.camposMascarados.CPF, '12345678900');
  assert.equal(JSON.stringify(card.camposMascarados).includes('segredoExtra'), false);
});
