import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AutenticadorAplicacaoIntegracao, calcularHashSegredoAplicacao } from '../dist/disparos-transacionais/autenticador-aplicacao-integracao.js';
import { PlanejadorDisparoTransacional } from '../dist/disparos-transacionais/planejador-disparo-transacional.js';

const segredo = 'segredo-de-integracao-com-mais-de-32-caracteres';
const aplicacao = { estado: 'ATIVA', id: randomUUID(), nome: 'erp', segredoHash: calcularHashSegredoAplicacao(segredo) };
const ids = { atendimentoId: randomUUID(), contatoId: randomUUID(), contaWhatsAppId: randomUUID(), conversaId: randomUUID(), modeloId: randomUUID() };
const consentimento = { contaWhatsAppId: ids.contaWhatsAppId, contatoId: ids.contatoId, estado: 'CONCEDIDO', finalidade: 'MENSAGEM_TRANSACIONAL', id: randomUUID() };
const entrada = { ...ids, chaveIdempotencia: 'fatura-2026-000001', idioma: 'pt_BR', parametros: { nome: 'João' }, segredoAplicacao: segredo };

test('autenticação máquina-a-máquina compara hash e recusa segredo ou aplicação inválidos', () => {
  const autenticador = new AutenticadorAplicacaoIntegracao();
  assert.deepEqual(autenticador.autenticar(aplicacao, segredo), { aplicacaoId: aplicacao.id });
  assert.throws(() => autenticador.autenticar(aplicacao, `${segredo}-errado`), /APLICACAO_NAO_AUTENTICADA/u);
  assert.throws(() => autenticador.autenticar({ ...aplicacao, estado: 'INATIVA' }, segredo), /APLICACAO_NAO_AUTENTICADA/u);
  assert.equal(JSON.stringify(aplicacao).includes(segredo), false);
});

test('consentimento no escopo cria modelo aprovado em NA_FILA, evento e caixa de saída', () => {
  const resultado = new PlanejadorDisparoTransacional().planejar(aplicacao, consentimento, entrada, undefined, () => new Date('2026-09-01T12:00:00Z'));
  assert.equal(resultado.resultado, 'CRIADO');
  assert.equal(resultado.disparo.mensagem.estadoSaida, 'NA_FILA');
  assert.equal(resultado.disparo.mensagem.tipo, 'MODELO_APROVADO');
  assert.equal(resultado.disparo.mensagem.usuarioRemetenteId, undefined);
  assert.equal(resultado.evento.estado, 'NA_FILA');
  assert.equal(resultado.caixaSaida.destino, 'MENSAGERIA');
  assert.throws(() => new PlanejadorDisparoTransacional().planejar(aplicacao, { ...consentimento, estado: 'REVOGADO' }, entrada), /CONSENTIMENTO_TRANSACIONAL_NAO_CONCEDIDO/u);
});

test('idempotência repete o mesmo resultado, recusa divergência e retorna estado da mensagem', () => {
  const planejador = new PlanejadorDisparoTransacional();
  const criado = planejador.planejar(aplicacao, consentimento, entrada);
  const repetido = planejador.planejar(aplicacao, consentimento, entrada, criado.disparo);
  assert.equal(repetido.resultado, 'REPETIDO');
  assert.equal(repetido.disparo.id, criado.disparo.id);
  assert.throws(() => planejador.planejar(aplicacao, consentimento, { ...entrada, parametros: { nome: 'Outra pessoa' } }, criado.disparo), /IDEMPOTENCIA_DISPARO_DIVERGENTE/u);
  assert.deepEqual(planejador.obterRetorno(criado.disparo, { ...criado.disparo.mensagem, estadoSaida: 'ENTREGUE' }), { disparoId: criado.disparo.id, estado: 'ENTREGUE', mensagemId: criado.disparo.mensagemId });
});
