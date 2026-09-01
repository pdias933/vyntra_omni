import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('schema impõe exatamente uma conversa por contato sem estado de fechamento', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831001600_criar_conversa_unica/migration.sql',
    ),
  ]);
  assert.match(schema, /model Conversa/);
  assert.match(migration, /conversa_contato_key/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.ok(!/estado_conversa|encerrad[ao]_em|fechad[ao]_em/iu.test(migration));
});

test('participação preserva várias contas na mesma timeline', async () => {
  const migration = await ler(
    'apps/api/prisma/migrations/20260831001600_criar_conversa_unica/migration.sql',
  );
  assert.match(migration, /PRIMARY KEY \("conversa_id", "conta_whatsapp_id"\)/);
  assert.match(migration, /primeira_interacao_em/);
  assert.match(migration, /ultima_interacao_em/);
  assert.match(migration, /participacao_conta_conversa_conta_fkey/);
});

test('resolução serializa pelo contato e não cria conversa por conta', async () => {
  const [servico, repositorio, modulo] = await Promise.all([
    ler('apps/api/src/conversas/servico-conversas.ts'),
    ler('apps/api/src/conversas/repositorio-conversas-prisma.ts'),
    ler('apps/api/src/conversas/modulo-conversas.ts'),
  ]);
  assert.ok(servico.indexOf('bloquearContato') < servico.indexOf('obterPorContato'));
  assert.match(repositorio, /where: \{ contatoId \}/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.ok(!modulo.includes('Controller'));
});

test('prontidão avança para a migration obrigatória mais recente', async () => {
  const persistencia = await ler('apps/api/src/persistencia/servico-prisma.ts');
  assert.match(
    persistencia,
    /20260901004500_reserva_desbloqueio_confianca/,
  );
});
