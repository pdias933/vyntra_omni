import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('calendário pertence a conta ou fila e materializa todas as variações aprovadas', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260901002100_criar_calendarios/migration.sql', raiz), 'utf8'),
  ]);
  assert.match(schema, /model CalendarioAtendimento/);
  assert.match(schema, /model PeriodoSemanalCalendario/);
  assert.match(schema, /model FeriadoCalendario/);
  assert.match(schema, /model ExcecaoCalendario/);
  assert.match(schema, /model OverrideCalendario/);
  assert.match(migration, /calendario_atendimento_alvo_check/);
  assert.match(migration, /VINTE_QUATRO_SETE/);
  assert.match(migration, /PERIODO_CALENDARIO_SOBREPOSTO/);
});

test('override é autorizado, auditado e imutável', async () => {
  const [servico, migration] = await Promise.all([
    readFile(new URL('apps/api/src/calendarios/servico-calendarios.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260901002100_criar_calendarios/migration.sql', raiz), 'utf8'),
  ]);
  assert.match(servico, /ADMINISTRAR_CALENDARIOS/);
  assert.match(servico, /OVERRIDE_CALENDARIO_DEFINIDO/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.match(migration, /OVERRIDE_CALENDARIO_IMUTAVEL/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
});
