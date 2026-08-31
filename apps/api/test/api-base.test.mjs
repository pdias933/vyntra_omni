import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { criarAplicacao } from '../dist/configurar-aplicacao.js';
import { FiltroExcecaoHttp } from '../dist/http/filtro-excecao-http.js';

let aplicacao;
let enderecoBase;

before(async () => {
  aplicacao = await criarAplicacao({ logger: false });
  await aplicacao.listen(0, '127.0.0.1');
  enderecoBase = await aplicacao.getUrl();
});

after(async () => {
  await aplicacao.close();
});

test('publica a versão base em /api/v1', async () => {
  const resposta = await fetch(`${enderecoBase}/api/v1`);

  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), {
    nome: 'Vyntra Omnichannel',
    versao_api: 'v1',
  });
});

test('retorna erro canônico sem detalhe interno', async () => {
  const resposta = await fetch(`${enderecoBase}/api/v1/rota-inexistente`);

  assert.equal(resposta.status, 404);
  assert.deepEqual(await resposta.json(), {
    codigo: 'RECURSO_NAO_ENCONTRADO',
    mensagem: 'O recurso solicitado não foi encontrado.',
  });
});

test('oculta mensagem e stack de erro interno', () => {
  let respostaEnviada;
  const filtro = new FiltroExcecaoHttp({
    httpAdapter: {
      reply: (_resposta, corpo, status) => {
        respostaEnviada = { corpo, status };
      },
    },
  });
  const contexto = {
    switchToHttp: () => ({ getResponse: () => ({}) }),
  };

  filtro.catch(new Error('TOKEN_INTERNO_NAO_PODE_VAZAR'), contexto);

  assert.deepEqual(respostaEnviada, {
    corpo: {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir a solicitação.',
    },
    status: 500,
  });
});

test('publica contrato OpenAPI sem interface navegável', async () => {
  const contrato = await fetch(`${enderecoBase}/api/v1/openapi.json`);
  const interfaceNavegavel = await fetch(
    `${enderecoBase}/api/v1/documentacao`,
  );

  assert.equal(contrato.status, 200);
  assert.equal(interfaceNavegavel.status, 404);

  const documento = await contrato.json();
  assert.equal(
    documento.paths['/api/v1'].get.operationId,
    'obterInformacoesApi',
  );
});
