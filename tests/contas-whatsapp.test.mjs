import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('schema permite múltiplas contas e preserva identidade interna', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831001100_criar_conta_whatsapp/migration.sql',
    ),
  ]);
  assert.match(schema, /model ContaWhatsApp/);
  assert.match(schema, /id\s+String\s+@id @db\.Uuid/);
  assert.match(migration, /conta_whatsapp_identidade_externa_key/);
  assert.ok(!migration.includes('UNIQUE ("nome_exibicao")'));
  assert.ok(!migration.includes('instalacao_id'));
});

test('credenciais não pertencem à tabela nem ao modelo de domínio', async () => {
  const [migration, modelo] = await Promise.all([
    ler(
      'apps/api/prisma/migrations/20260831001100_criar_conta_whatsapp/migration.sql',
    ),
    ler('apps/api/src/contas-whatsapp/modelo-conta-whatsapp.ts'),
  ]);
  for (const termo of ['token', 'segredo', 'credencial', 'certificado']) {
    assert.ok(!migration.toLowerCase().includes(termo));
    assert.ok(!modelo.toLowerCase().includes(termo));
  }
  assert.match(modelo, /interface OrigemContaWhatsApp/);
  assert.match(modelo, /contaWhatsAppId/);
});

test('repositório preserva histórico ao não expor exclusão', async () => {
  const porta = await ler(
    'apps/api/src/contas-whatsapp/repositorio-conta-whatsapp.ts',
  );
  assert.match(porta, /criar/);
  assert.match(porta, /listar/);
  assert.match(porta, /obterPorId/);
  assert.ok(!/excluir|apagar|remover|delete/iu.test(porta));
});

test('módulo de conta é real, mas não registra adapter ou segredo Meta', async () => {
  const [modulo, aplicacao] = await Promise.all([
    ler('apps/api/src/contas-whatsapp/modulo-contas-whatsapp.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
  ]);
  assert.match(aplicacao, /ModuloContasWhatsApp/);
  assert.match(modulo, /RepositorioContaWhatsAppPrisma/);
  assert.ok(!modulo.includes('AdaptadorMetaCloud'));
  assert.ok(!modulo.toLowerCase().includes('token'));
});
