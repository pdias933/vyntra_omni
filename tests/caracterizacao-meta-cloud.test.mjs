import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const documento = await readFile(new URL('../docs/integracoes/PR-043-CARACTERIZACAO-META-CLOUD.md', import.meta.url), 'utf8');
const caracterizacao = await readFile(new URL('../apps/api/src/mensageria/adaptadores/meta-cloud/caracterizacao-meta-cloud.ts', import.meta.url), 'utf8');
const fixture = await readFile(new URL('../apps/api/test/fixtures/meta-cloud/mensagem-bsuid-sem-telefone.json', import.meta.url), 'utf8');

test('caracterização cita fontes oficiais e não promove fixture a conta real', () => {
  assert.match(documento, /postman\.com\/meta\/whatsapp-business-platform/u);
  assert.match(documento, /developers\.meta\.com\/resources\/videos\/whatsapp-usernames/u);
  assert.match(documento, /não foi fornecida uma conta Meta/iu);
  assert.match(documento, /falha fechada/iu);
  assert.match(caracterizacao, /FIXTURE_SANITIZADA/u);
  assert.match(caracterizacao, /CONTA_REAL/u);
});

test('fixture cobre BSUID sem telefone e não contém segredo real', () => {
  assert.match(fixture, /"user_id": "US\.BSUID_SANITIZADO"/u);
  assert.match(fixture, /"wa_id": ""/u);
  assert.doesNotMatch(fixture, /access_token|app_secret|Bearer\s/iu);
});
