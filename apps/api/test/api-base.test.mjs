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
  const correlacaoId = resposta.headers.get('x-correlation-id');

  assert.equal(resposta.status, 404);
  assert.match(correlacaoId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await resposta.json(), {
    codigo: 'RECURSO_NAO_ENCONTRADO',
    correlacao_id: correlacaoId,
    mensagem: 'O recurso solicitado não foi encontrado.',
  });
});

test('preserva correlação válida e rejeita valor injetado', async () => {
  const correlacaoValida = 'f4632792-8fa5-4aa3-bf1f-9f096fb942b5';
  const valida = await fetch(`${enderecoBase}/api/v1`, {
    headers: { 'x-correlation-id': correlacaoValida },
  });
  const invalida = await fetch(`${enderecoBase}/api/v1`, {
    headers: { 'x-correlation-id': 'token-nao-confiavel' },
  });

  assert.equal(valida.headers.get('x-correlation-id'), correlacaoValida);
  assert.match(invalida.headers.get('x-correlation-id'), /^[0-9a-f-]{36}$/);
  assert.notEqual(
    invalida.headers.get('x-correlation-id'),
    'token-nao-confiavel',
  );
});

test('oculta mensagem e stack de erro interno', () => {
  let respostaEnviada;
  const filtro = new FiltroExcecaoHttp(
    {
      httpAdapter: {
        reply: (_resposta, corpo, status) => {
          respostaEnviada = { corpo, status };
        },
      },
    },
    { registrar: () => undefined },
  );
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

test('publica liveness leve e readiness saudável sem dependência configurada', async () => {
  const vivo = await fetch(`${enderecoBase}/api/v1/saude/vivo`);
  const pronto = await fetch(`${enderecoBase}/api/v1/saude/pronto`);

  assert.equal(vivo.status, 200);
  assert.deepEqual(await vivo.json(), { estado: 'VIVO' });
  assert.equal(pronto.status, 200);
  assert.deepEqual(await pronto.json(), { estado: 'PRONTO' });
});

test('readiness falha fechada em ambiente estrito sem configuração', async () => {
  const ambienteAnterior = process.env.AMBIENTE_APLICACAO;
  process.env.AMBIENTE_APLICACAO = 'staging';

  try {
    const resposta = await fetch(`${enderecoBase}/api/v1/saude/pronto`);
    const corpo = await resposta.json();

    assert.equal(resposta.status, 503);
    assert.equal(corpo.codigo, 'SERVICO_NAO_PRONTO');
    assert.equal(corpo.correlacao_id, resposta.headers.get('x-correlation-id'));
  } finally {
    if (ambienteAnterior === undefined) {
      delete process.env.AMBIENTE_APLICACAO;
    } else {
      process.env.AMBIENTE_APLICACAO = ambienteAnterior;
    }
  }
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
  assert.equal(
    documento.paths['/api/v1/saude/pronto'].get.operationId,
    'verificarAplicacaoPronta',
  );
});
