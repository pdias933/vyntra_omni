import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('alias e evento anterior→atual preservam histórico por FK restritiva', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831001300_criar_alias_alteracao_identidade/migration.sql',
    ),
  ]);
  assert.match(schema, /model AliasIdentidadeWhatsApp/);
  assert.match(schema, /model EventoAlteracaoIdentidadeWhatsApp/);
  assert.match(migration, /PRESERVADA/);
  assert.match(migration, /SEPARADA_INCERTA/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /evento_alteracao_identidade_distinta_check/);
});

test('resolução consulta identificador atual e alias sem telefone como fallback', async () => {
  const repositorio = await ler(
    'apps/api/src/contatos/repositorio-contatos-prisma.ts',
  );
  assert.match(repositorio, /aliasIdentidadeWhatsApp\.findUnique/);
  assert.ok(!/telefoneE164[\s\S]{0,80}findUnique/.test(repositorio));
});

test('serviço bloqueia as duas chaves e separa caso incerto', async () => {
  const servico = await ler(
    'apps/api/src/contatos/servico-alteracao-identidade-whatsapp.ts',
  );
  assert.match(servico, /\.sort\(\)/);
  assert.match(servico, /SEPARADA_INCERTA/);
  assert.match(servico, /ServicoIdentidadeWhatsApp/);
  assert.ok(!/mesclar|merge/iu.test(servico));
});

test('prontidão exige a migration de alias mais recente', async () => {
  const persistencia = await ler('apps/api/src/persistencia/servico-prisma.ts');
  assert.match(persistencia, /20260831001300_criar_alias_alteracao_identidade/);
});
