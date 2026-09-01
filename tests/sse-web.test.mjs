import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('SSE web autentica por cookie e publica sequência como id', async () => {
  const controlador = await ler(
    'apps/api/src/sincronizacao/controlador-sincronizacao.ts',
  );
  assert.match(controlador, /@Sse\('eventos'\)/);
  assert.match(controlador, /autenticacaoWeb\.autenticar/);
  assert.match(controlador, /last-event-id/);
  assert.match(controlador, /id: evento\.sequenciaEvento/);
  assert.match(controlador, /X-Accel-Buffering', 'no'/);
  assert.ok(!/autenticacaoMobile\.autenticar[\s\S]{0,300}acompanharEventosWeb/u.test(controlador));
});

test('handoff assina e bufferiza antes de capturar a marca d’água', async () => {
  const coordenador = await ler(
    'apps/api/src/sincronizacao/coordenador-sse-sem-lacuna.ts',
  );
  assert.ok(
    coordenador.indexOf('void consultarAssinatura()') <
      coordenador.indexOf('void this.inicializar('),
  );
  assert.match(coordenador, /buffer\.push/);
  assert.match(coordenador, /obterMarcaDagua/);
  assert.match(coordenador, /evento\.sequenciaEvento\) > marcaDagua/);
  assert.match(coordenador, /BUFFER_SSE_EXCEDIDO/);
});

test('falha fecha o stream e o PostgreSQL continua como autoridade', async () => {
  const coordenador = await ler(
    'apps/api/src/sincronizacao/coordenador-sse-sem-lacuna.ts',
  );
  assert.match(coordenador, /destino\.falhar/);
  assert.match(coordenador, /sincronizacao\.sincronizar/);
  assert.ok(!/Redis|eventoDominio\.findMany|set.*Disponibilidade/u.test(coordenador));
});
