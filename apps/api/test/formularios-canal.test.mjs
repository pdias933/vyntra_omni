import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ProjetorSubmissaoFormulario } from '../dist/formularios/projetor-submissao-formulario.js';
import { ServicoFormularios } from '../dist/formularios/servico-formularios.js';
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

function criarServico(sobrescritas = {}) {
  const chamadas = { bloqueios: [], criacoes: [], eventos: [] };
  let existenteMensagem = sobrescritas.existenteMensagem;
  let existenteReferencia = sobrescritas.existenteReferencia;
  const contexto = sobrescritas.contexto ?? {
    atendimentoId: randomUUID(),
    contatoId: randomUUID(),
    conversaId: randomUUID(),
    formularioId: formulario.id,
    recebidaEm: new Date('2026-09-01T12:00:00Z'),
  };
  const repositorio = {
    acrescentarSubmissao: async (item) => {
      chamadas.criacoes.push(item);
      existenteMensagem = item;
      existenteReferencia = item;
    },
    bloquearSubmissao: async (...argumentos) => chamadas.bloqueios.push(argumentos),
    formularioAtivoNoAtendimento: async () => sobrescritas.formularioAtivo ?? true,
    obterContextoSubmissao: async () => contexto,
    obterSubmissaoPorMensagem: async () => existenteMensagem,
    obterSubmissaoPorReferencia: async () => existenteReferencia,
  };
  const eventos = {
    acrescentar: async (...argumentos) => {
      chamadas.eventos.push(argumentos);
      return { sequenciaEvento: 79n };
    },
  };
  return {
    chamadas,
    repositorio,
    servico: new ServicoFormularios(repositorio, eventos),
    transacao: { id: 'transacao-formulario' },
  };
}

test('submissão é persistida uma vez e produz evento sem conteúdo sensível', async () => {
  const cenario = criarServico();
  const mensagemId = randomUUID();
  const entrada = {
    dadosProtegidos: { cpf: '12345678900', nome: 'João' },
    formularioReferenciaCanal: 'flow-1',
    referenciaCanal: 'c'.repeat(64),
  };
  const criada = await cenario.servico.registrarSubmissao(
    mensagemId,
    entrada,
    cenario.transacao,
  );
  assert.equal(criada.resultado, 'PERSISTIDA');
  assert.equal(criada.sequenciaEvento, 79n);
  assert.equal(cenario.chamadas.criacoes.length, 1);
  assert.equal(cenario.chamadas.eventos.length, 1);
  assert.equal(
    JSON.stringify(cenario.chamadas.eventos).includes('12345678900'),
    false,
  );

  const repetida = await cenario.servico.registrarSubmissao(
    mensagemId,
    { ...entrada, dadosProtegidos: { nome: 'João', cpf: '12345678900' } },
    cenario.transacao,
  );
  assert.equal(repetida.resultado, 'DUPLICADA');
  assert.equal(cenario.chamadas.criacoes.length, 1);
  assert.equal(cenario.chamadas.eventos.length, 1);
});

test('repetição divergente e mensagem sem contexto válido falham fechado', async () => {
  const mensagemId = randomUUID();
  const base = criarServico();
  const entrada = {
    dadosProtegidos: { nome: 'João' },
    formularioReferenciaCanal: 'flow-1',
    referenciaCanal: 'd'.repeat(64),
  };
  await base.servico.registrarSubmissao(mensagemId, entrada, base.transacao);
  await assert.rejects(
    base.servico.registrarSubmissao(
      mensagemId,
      { ...entrada, dadosProtegidos: { nome: 'Outra pessoa' } },
      base.transacao,
    ),
    /IDEMPOTENCIA_SUBMISSAO_FORMULARIO_DIVERGENTE/u,
  );

  const semContexto = criarServico({ contexto: undefined });
  semContexto.repositorio.obterContextoSubmissao = async () => undefined;
  await assert.rejects(
    semContexto.servico.registrarSubmissao(randomUUID(), entrada, semContexto.transacao),
    /CONTEXTO_SUBMISSAO_FORMULARIO_INVALIDO/u,
  );
  assert.equal(semContexto.chamadas.criacoes.length, 0);
});
