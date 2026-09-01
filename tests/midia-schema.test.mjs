import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../apps/api/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(new URL('../apps/api/prisma/migrations/20260901002600_criar_midia_mensagem/migration.sql', import.meta.url), 'utf8');
const modelo = await readFile(new URL('../apps/api/src/midias/modelo-midia.ts', import.meta.url), 'utf8');

test('mídia pertence à mensagem e não materializa URL pública', () => {
  assert.match(schema, /model MidiaMensagem \{/u);
  assert.match(schema, /mensagemId\s+String\s+@id/u);
  assert.match(schema, /bucketPrivado\s+String/u);
  assert.match(schema, /chaveObjeto\s+String/u);
  assert.doesNotMatch(schema.match(/model MidiaMensagem \{[\s\S]*?\n\}/u)[0], /\burl\b/iu);
  assert.doesNotMatch(modelo, /urlPublica|urlAssinada/u);
});

test('PostgreSQL exige MIME confirmado, chave opaca, tipo compatível e imutabilidade', () => {
  assert.match(migration, /"mime_declarado" = "mime_detectado"/u);
  assert.match(migration, /\^midias\//u);
  assert.match(migration, /validar_tipo_midia_mensagem/u);
  assert.match(migration, /MIDIA_MENSAGEM_IMUTAVEL/u);
  assert.match(migration, /ON DELETE RESTRICT/u);
});
