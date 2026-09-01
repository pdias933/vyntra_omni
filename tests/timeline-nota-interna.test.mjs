import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('timeline usa união discriminada para os cinco tipos aprovados', async () => {
  const modelo = await readFile(
    new URL('apps/api/src/timeline/modelo-timeline.ts', raiz),
    'utf8',
  );
  for (const tipo of [
    'MENSAGEM',
    'NOTA_INTERNA',
    'EVENTO_OPERACIONAL',
    'FORMULARIO',
    'SEPARADOR_ATENDIMENTO',
  ]) assert.match(modelo, new RegExp(`'${tipo}'`));
  assert.match(modelo, /export type ItemTimeline =/);
  assert.match(modelo, /visibilidade: 'SOMENTE_EQUIPE'/);
});

test('NotaInterna é somente equipe, imutável e não possui caminho de saída', async () => {
  const [schema, migration, modulo, servico] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260901002400_criar_timeline_nota_interna/migration.sql', raiz), 'utf8'),
    readFile(new URL('apps/api/src/notas-internas/modulo-notas-internas.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/notas-internas/servico-notas-internas.ts', raiz), 'utf8'),
  ]);
  assert.match(schema, /model NotaInterna/);
  assert.match(schema, /SOMENTE_EQUIPE/);
  assert.match(migration, /NOTA_INTERNA_IMUTAVEL/);
  assert.match(migration, /nota_interna_atendimento_conversa_fkey/);
  assert.match(servico, /ADICIONAR_NOTA_INTERNA/);
  assert.doesNotMatch(`${modulo}\n${servico}`, /CaixaSaida|Adaptador|MetaCloud|enviar|mensageria/iu);
});
