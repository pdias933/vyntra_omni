import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('janela é única por contato e conta e preserva alertas por versão', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(new URL('apps/api/prisma/migrations/20260901002300_criar_janela_atendimento_canal/migration.sql', raiz), 'utf8'),
  ]);
  assert.match(schema, /model JanelaAtendimentoCanal/);
  assert.match(schema, /model AlertaJanelaCanal/);
  assert.match(migration, /janela_canal_contato_conta_key/);
  assert.match(migration, /INTERVAL '24 hours'/);
  assert.match(migration, /alerta_janela_canal_versao_marco_key/);
});

test('domínio bloqueia texto livre sem conhecer o contrato externo da Meta', async () => {
  const servico = await readFile(
    new URL('apps/api/src/janela-canal/servico-janela-canal.ts', raiz),
    'utf8',
  );
  assert.match(servico, /TEXTO_LIVRE/);
  assert.match(servico, /MODELO_APROVADO/);
  assert.match(servico, /ErroTextoLivreForaJanela/);
  assert.doesNotMatch(servico, /template|cloud api|graph\.facebook|meta/iu);
});
