import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('disponibilidade é manual, persistida, versionada e auditada', async () => {
  const [schema, servico, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(new URL('apps/api/src/disponibilidade/servico-disponibilidade.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260831001900_criar_disponibilidade_manual/migration.sql', raiz), 'utf8'),
  ]);
  assert.match(schema, /model DisponibilidadeUsuario/);
  assert.match(schema, /DISPONIVEL\n\s+INDISPONIVEL/);
  assert.match(servico, /versaoEsperada/);
  assert.match(servico, /DISPONIBILIDADE_USUARIO_ALTERADA/);
  assert.match(migration, /ALTERAR_DISPONIBILIDADE_PROPRIA/);
  assert.doesNotMatch(`${servico}\n${migration}`, /heartbeat|websocket|push|app_aberto/iu);
});

test('alteração própria e administrativa são permissões separadas', async () => {
  const matriz = await readFile(new URL('apps/api/src/autorizacao/matriz-permissoes.ts', raiz), 'utf8');
  assert.match(matriz, /ALTERAR_DISPONIBILIDADE_PROPRIA/);
  assert.match(matriz, /ALTERAR_DISPONIBILIDADE_USUARIO/);
});

