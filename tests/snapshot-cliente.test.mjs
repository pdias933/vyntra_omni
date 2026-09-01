import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('snapshot é único por vínculo e persiste somente documento protegido', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831001500_criar_snapshot_cliente/migration.sql',
    ),
  ]);
  assert.match(schema, /model SnapshotCliente/);
  assert.match(schema, /dadosProtegidos\s+Json/);
  assert.match(migration, /snapshot_cliente_vinculo_key/);
  assert.match(migration, /jsonb_typeof\("dados_protegidos"\) = 'object'/);
  assert.ok(!/cpf|cnpj|documento_bruto/iu.test(migration));
});

test('origem, captura, hash e versão tornam idade e ordem explícitas', async () => {
  const [schema, servico] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler('apps/api/src/snapshots-cliente/servico-snapshots-cliente.ts'),
  ]);
  assert.match(schema, /OrigemSnapshotCliente/);
  assert.match(schema, /capturadoEm/);
  assert.match(schema, /conteudoHash/);
  assert.match(servico, /idadeSegundos/);
  assert.match(servico, /IGNORADO_MAIS_ANTIGO/);
  assert.match(servico, /CONFLITO_SNAPSHOT_CLIENTE|ErroConflitoSnapshotCliente/);
});

test('PostgreSQL é autoridade e módulo não publica escrita ou usa Redis', async () => {
  const arquivos = await Promise.all([
    ler('apps/api/src/snapshots-cliente/modulo-snapshots-cliente.ts'),
    ler('apps/api/src/snapshots-cliente/repositorio-snapshots-cliente-prisma.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
  ]);
  const codigo = arquivos.join('\n');
  assert.match(codigo, /ModuloSnapshotsCliente/);
  assert.match(codigo, /pg_advisory_xact_lock/);
  assert.ok(!/Redis|Controller/.test(codigo));
});

test('estado persistido distingue atual, obsoleto e excluído sem apagar dados', async () => {
  const [schema, migration, sincronizacao] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901003500_estado_snapshot_cliente/migration.sql',
    ),
    ler(
      'apps/api/src/snapshots-cliente/servico-sincronizacao-snapshots-cliente.ts',
    ),
  ]);
  assert.match(schema, /EstadoSnapshotCliente/);
  assert.match(migration, /ATUAL.*OBSOLETO.*EXCLUIDO/su);
  assert.match(migration, /AUSENTE_RECONCILIACAO_COMPLETA/);
  assert.match(migration, /TOMBSTONE_ERP/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE/iu);
  assert.match(sincronizacao, /confirmadaCompleta: true/);
  assert.match(sincronizacao, /LIMITE_LOTE = 100/);
});
