import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(new URL('../apps/api/prisma/migrations/20260901002700_criar_entrada_canal/migration.sql', import.meta.url), 'utf8');
const adaptador = await readFile(new URL('../apps/api/src/mensageria/adaptadores/meta-cloud/entrada-meta-cloud.ts', import.meta.url), 'utf8');

test('recepção é deduplicada por conta e identificador externo', () => {
  assert.match(migration, /evento_entrada_canal_conta_evento_key/u);
  assert.match(migration, /UNIQUE INDEX/u);
  assert.match(migration, /RECEBIDO.*PERSISTIDO/su);
  assert.match(migration, /EVENTO_ENTRADA_CANAL_IMUTAVEL/u);
});

test('adapter usa HMAC SHA-256 no corpo bruto e persiste antes de emitir evento', () => {
  assert.match(adaptador, /createHmac\('sha256', segredo\)\.update\(corpo\)/u);
  assert.match(adaptador, /timingSafeEqual/u);
  assert.ok(adaptador.indexOf('acrescentarMensagem(') < adaptador.indexOf('eventos.acrescentar('));
  assert.ok(adaptador.indexOf('marcarPersistida(') < adaptador.indexOf('eventos.acrescentar('));
});
