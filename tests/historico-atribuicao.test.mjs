import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('histórico de atribuição materializa intervalos para métricas', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/prisma/migrations/20260901002000_criar_historico_atribuicao/migration.sql',
        raiz,
      ),
      'utf8',
    ),
  ]);
  assert.match(schema, /model HistoricoAtribuicao/);
  assert.match(migration, /um_aberto_por_atendimento_key/);
  assert.match(migration, /WHERE "finalizado_em" IS NULL/);
  assert.match(migration, /historico_atribuicao_fila_intervalo_idx/);
  assert.match(migration, /historico_atribuicao_responsavel_intervalo_idx/);
});

test('histórico preserva tipos de domínio e é protegido contra reescrita', async () => {
  const migration = await readFile(
    new URL(
      'apps/api/prisma/migrations/20260901002000_criar_historico_atribuicao/migration.sql',
      raiz,
    ),
    'utf8',
  );
  for (const tipo of [
    'ENTRADA_FILA',
    'RESGATE',
    'TRANSFERENCIA_FILA',
    'TRANSFERENCIA_USUARIO',
    'ASSUNCAO_SUPERVISOR',
    'REABERTURA',
  ]) {
    assert.match(migration, new RegExp(tipo));
  }
  assert.match(migration, /HISTORICO_ATRIBUICAO_IMUTAVEL/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /BEFORE TRUNCATE/);
});
