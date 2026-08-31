import assert from 'node:assert/strict';
import test from 'node:test';

import { contextoCorrelacao } from '../dist/observabilidade/contexto-correlacao.js';
import { LoggerEstruturado } from '../dist/observabilidade/logger-estruturado.js';
import { SanitizadorLogs } from '../dist/observabilidade/sanitizador-logs.js';

test('sanitização central remove campos e valores sensíveis', () => {
  const sanitizador = new SanitizadorLogs();
  const registro = sanitizador.sanitizarRegistro({
    evento: 'TESTE',
    mensagem: 'cpf=123.456.789-00 token=segredo-super-secreto',
    payload: 'não pode entrar',
    senha: 'não pode entrar',
  });

  assert.equal(registro.evento, 'TESTE');
  assert.equal(registro.payload, undefined);
  assert.equal(registro.senha, undefined);
  assert.ok(!registro.mensagem.includes('123.456.789-00'));
  assert.ok(!registro.mensagem.includes('segredo-super-secreto'));
});

test('logger Pino emite JSON com correlação e sem campo proibido', () => {
  const linhas = [];
  const logger = new LoggerEstruturado({
    write: (linha) => linhas.push(linha),
  });
  const correlacaoId = '4548c3e6-81e1-4ff3-b95b-1c46cb9c6f62';

  contextoCorrelacao.executar(correlacaoId, () => {
    logger.registrar('info', 'OPERACAO_TESTE', {
      modulo: 'TESTE',
      payload: 'segredo',
      status_http: 200,
    });
  });

  const registro = JSON.parse(linhas.at(-1));
  assert.equal(registro.evento, 'OPERACAO_TESTE');
  assert.equal(registro.correlacao_id, correlacaoId);
  assert.equal(registro.status_http, 200);
  assert.equal(registro.payload, undefined);
});
