import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('protocolo pendente não armazena número falso e oficial é único e imutável', async () => {
  const [schema, migration, servico] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/prisma/migrations/20260831001800_criar_protocolo_erp_pendente/migration.sql',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL('apps/api/src/protocolos-erp/servico-protocolos-erp.ts', raiz),
      'utf8',
    ),
  ]);
  assert.match(schema, /model ProtocoloErp/);
  assert.match(schema, /protocoloOficial\s+String\?/);
  assert.match(migration, /'PENDENTE' AND "protocolo_oficial" IS NULL/);
  assert.match(migration, /protocolo_erp_oficial_key/);
  assert.match(migration, /protocolo_erp_oficial_imutavel/);
  assert.match(servico, /resultado\.resultado !== 'CONFIRMADO'/);
  assert.doesNotMatch(servico, /SIM-|protocoloOficial:\s*atendimentoId/);
});

test('módulo de protocolo não publica controller nem registra adapter real', async () => {
  const modulo = await readFile(
    new URL('apps/api/src/protocolos-erp/modulo-protocolos-erp.ts', raiz),
    'utf8',
  );
  assert.doesNotMatch(modulo, /controllers/);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP|AdaptadorErpSimulado/);
});

