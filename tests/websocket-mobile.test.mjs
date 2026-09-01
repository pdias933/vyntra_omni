import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('gateway mobile autentica token, aparelho e segredo antes do upgrade', async () => {
  const gateway = await ler(
    'apps/api/src/sincronizacao/gateway-eventos-mobile.ts',
  );
  const main = await ler('apps/api/src/main.ts');
  assert.match(gateway, /\/api\/v1\/sincronizacao\/eventos-mobile/);
  assert.match(gateway, /searchParams\.get\('apos'\)/);
  assert.match(gateway, /NOME_HEADER_DISPOSITIVO_MOBILE/);
  assert.match(gateway, /NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE/);
  assert.match(gateway, /autenticacao\.autenticar/);
  assert.ok(
    gateway.indexOf('await this.autenticacao.autenticar') <
      gateway.indexOf('handleUpgrade'),
  );
  assert.match(main, /GatewayEventosMobile/);
  assert.match(main, /\.anexar\(aplicacao\.getHttpServer\(\)\)/);
});

test('handoff mobile bufferiza antes da marca d’água e entra vivo sem lacuna', async () => {
  const coordenador = await ler(
    'apps/api/src/sincronizacao/coordenador-websocket-mobile-sem-lacuna.ts',
  );
  assert.ok(
    coordenador.indexOf('void consultarAssinatura()') <
      coordenador.indexOf('void this.inicializar('),
  );
  assert.match(coordenador, /buffer\.push/);
  assert.match(coordenador, /obterMarcaDagua/);
  assert.match(coordenador, /'MOBILE'/);
  assert.match(coordenador, /evento\.sequenciaEvento\) > marcaDagua/);
  assert.match(coordenador, /destino\.pronto/);
  assert.match(coordenador, /BUFFER_WEBSOCKET_MOBILE_EXCEDIDO/);
});

test('WebSocket confirma aplicação e fecha sob falha sem trocar PostgreSQL por Redis', async () => {
  const gateway = await ler(
    'apps/api/src/sincronizacao/gateway-eventos-mobile.ts',
  );
  const coordenador = await ler(
    'apps/api/src/sincronizacao/coordenador-websocket-mobile-sem-lacuna.ts',
  );
  assert.match(gateway, /tipo: 'CONFIRMADO'/);
  assert.match(gateway, /mensagem\.tipo !== 'CONFIRMAR'/);
  assert.match(gateway, /bufferedAmount/);
  assert.match(gateway, /conexao\.ping\(\)/);
  assert.match(coordenador, /sincronizacao\.sincronizar/);
  assert.ok(!/Redis|set.*Disponibilidade/u.test(gateway + coordenador));
});
