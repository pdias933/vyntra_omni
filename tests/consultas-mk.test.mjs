import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  'apps/api/prisma/migrations/20260902001000_criar_controles_consultas_mk_desativados/migration.sql',
  'utf8',
);
const modulo = await readFile('apps/api/src/erp/modulo-consultas-erp.ts', 'utf8');
const clienteHttp = await readFile(
  'apps/api/src/erp/adaptadores/mk-solutions/cliente-http-mk-solutions.ts',
  'utf8',
);
const worker = await readFile('apps/api/src/execucoes-fluxo/modulo-worker-fluxos.ts', 'utf8');
const compose = await readFile('compose.staging.yaml', 'utf8');

test('consultas MK nascem em dois controles independentes e desligados', () => {
  assert.match(migration, /'MK_CONSULTAS_CADASTRAIS_REAIS'/u);
  assert.match(migration, /'MK_CONSULTAS_FINANCEIRAS_REAIS'/u);
  assert.equal((migration.match(/'DESATIVADO'/gu) ?? []).length, 2);
  assert.equal((migration.match(/\n\s*0,?\n/gu) ?? []).length >= 2, true);
  assert.match(migration, /CONTROLE_MK_PREEXISTENTE/u);
  assert.doesNotMatch(migration, /ON CONFLICT/u);
});

test('provider parcial não registra escrita nem alcança o worker', () => {
  assert.match(modulo, /provide: CONSULTAS_ERP/u);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP/u);
  assert.doesNotMatch(worker, /ModuloConsultasErp|CONSULTAS_ERP/u);
});

test('conexão HTTPS fixa um único IP sem seleção automática de família', () => {
  assert.match(clienteHttp, /opcoes\.all === true/u);
  assert.match(clienteHttp, /callback\(null, \[\{ address:/u);
});

test('staging publica a integração desligada e sem segredos MK montados', () => {
  const api = compose.match(/\n {2}api:\n(?<bloco>[\s\S]*?)\n {2}worker_fluxos:\n/u)?.groups?.bloco;
  assert.match(api ?? '', /MK_MODO: DESATIVADO/u);
  assert.doesNotMatch(
    compose,
    /MK_TOKEN_CADASTRO_USUARIO_FILE|MK_CONTRASENHA_PERFIL_FILE/u,
  );
});
