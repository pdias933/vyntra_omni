import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('schema usa identificador estável no portfólio sem exigir username ou telefone', async () => {
  const schema = await ler('apps/api/prisma/schema.prisma');
  assert.match(schema, /model Contato/);
  assert.match(schema, /model IdentidadeWhatsApp/);
  assert.match(schema, /identidade_whatsapp_estavel_key/);
  assert.match(schema, /nomeUsuario\s+String\?/);
  assert.match(schema, /telefoneE164\s+String\?/);
  assert.ok(!/@@unique\(\[telefoneE164\]/.test(schema));
  assert.ok(!/@@unique\(\[nomeUsuario\]/.test(schema));
});

test('migration protege coerência, pesquisa e histórico', async () => {
  const migration = await ler(
    'apps/api/prisma/migrations/20260831001200_criar_contato_identidade_whatsapp/migration.sql',
  );
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /identidade_whatsapp_estavel_key/);
  assert.match(migration, /identidade_whatsapp_telefone_check/);
  assert.match(migration, /identidade_whatsapp_nome_usuario_idx/);
  assert.match(migration, /identidade_whatsapp_telefone_idx/);
});

test('resolução serializa por identidade antes de consultar ou criar', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/contatos/servico-identidade-whatsapp.ts'),
    ler('apps/api/src/contatos/repositorio-contatos-prisma.ts'),
  ]);
  assert.ok(
    servico.indexOf('bloquearIdentidade') <
      servico.indexOf('obterPorIdentificadorEstavel'),
  );
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(repositorio, /hashtextextended/);
});

test('módulo real não contém DTO ou adapter Meta', async () => {
  const [modulo, aplicacao, persistencia] = await Promise.all([
    ler('apps/api/src/contatos/modulo-contatos.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
    ler('apps/api/src/persistencia/servico-prisma.ts'),
  ]);
  assert.match(aplicacao, /ModuloContatos/);
  assert.ok(!modulo.includes('AdaptadorMetaCloud'));
  assert.match(persistencia, /20260831001200_criar_contato_identidade_whatsapp/);
});
