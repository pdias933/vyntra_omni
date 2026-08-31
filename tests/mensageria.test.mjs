import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('porta expõe somente tipos internos normalizados', async () => {
  const [porta, modelo] = await Promise.all([
    ler('apps/api/src/mensageria/porta-mensageria.ts'),
    ler('apps/api/src/mensageria/modelo-mensageria.ts'),
  ]);
  assert.match(porta, /interface CanalMensageria/);
  assert.match(porta, /interface ConsumidorEventosMensageria/);
  assert.match(modelo, /ACEITA/);
  assert.match(modelo, /TEMPORARIA/);
  assert.match(modelo, /DEFINITIVA/);
  assert.match(modelo, /CONFIGURACAO/);
  assert.ok(!modelo.includes('sent'));
  assert.ok(!modelo.includes('delivered'));
  assert.ok(!modelo.includes('wamid'));
});

test('vocabulário externo e simulação ficam no adapter Meta', async () => {
  const adaptador = await ler(
    'apps/api/src/mensageria/adaptadores/meta/adaptador-meta-cloud-simulado.ts',
  );
  assert.match(adaptador, /sent: 'ENVIADA'/);
  assert.match(adaptador, /delivered: 'ENTREGUE'/);
  assert.match(adaptador, /read: 'LIDA'/);
  assert.match(adaptador, /failed: 'FALHOU'/);
  assert.match(adaptador, /chaveIdempotencia/);
  assert.match(adaptador, /DUPLICADO/);
  assert.ok(!adaptador.includes('tokenMeta'));
});

test('simulador não é registrado como integração real de produção', async () => {
  const modulo = await ler('apps/api/src/modulo-aplicacao.ts');
  assert.ok(!modulo.includes('AdaptadorMetaCloudSimulado'));
  assert.ok(!modulo.includes('CANAL_MENSAGERIA'));
});
