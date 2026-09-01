import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('SLA materializa política, ciclos e alertas idempotentes', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260901002200_criar_sla_escalonamento/migration.sql', raiz), 'utf8'),
  ]);
  assert.match(schema, /model PoliticaSla/);
  assert.match(schema, /model RelogioSlaAtendimento/);
  assert.match(schema, /model AlertaSla/);
  assert.match(migration, /relogio_sla_atendimento_ativo_key/);
  assert.match(migration, /alerta_sla_relogio_nivel_key/);
  assert.match(migration, /ATENDENTE', 'SUPERVISOR', 'ADMINISTRADOR/);
});

test('escalonamento gera somente eventos e não transfere atendimento', async () => {
  const [servico, repositorio] = await Promise.all([
    readFile(new URL('apps/api/src/sla/servico-sla.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/sla/repositorio-sla-prisma.ts', raiz), 'utf8'),
  ]);
  assert.match(servico, /SLA_OBRIGACAO_HUMANA_INICIADA/);
  assert.match(servico, /SLA_ALERTA_\$\{nivel\}_EMITIDO/);
  assert.doesNotMatch(servico, /transferir|usuarioResponsavelId|filaAtualId/iu);
  assert.doesNotMatch(repositorio, /transacao\.atendimento\.update|transferir/iu);
});
