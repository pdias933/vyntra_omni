import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('caracterização MK usa fontes oficiais e registra evidência sanitizada sem fechar lacunas', async () => {
  const [documento, caracterizacao, fixturePublica, fixtureRealSanitizada] = await Promise.all([
    ler('docs/integracoes/PR-059-CARACTERIZACAO-MK-SOLUTIONS.md'),
    ler(
      'apps/api/src/erp/adaptadores/mk-solutions/caracterizacao-mk-solutions.ts',
    ),
    ler('apps/api/test/fixtures/mk-solutions/caracterizacao-publica-sanitizada.json'),
    ler('apps/api/test/fixtures/mk-solutions/consultas-reais-publicas-sanitizadas.json'),
  ]);
  assert.match(documento, /mkloud\.atlassian\.net\/wiki/u);
  assert.match(documento, /caracterização real.*exclusivamente de leitura/iu);
  assert.match(documento, /paginação.*não foram suficientemente caracterizados/iu);
  assert.match(documento, /MK_MODO=DESATIVADO/u);
  assert.match(caracterizacao, /FIXTURE_PUBLICA_SANITIZADA/u);
  assert.match(caracterizacao, /AMBIENTE_REAL/u);
  assert.match(fixturePublica, /"dtoResposta": "NAO_CONGELADO"/u);
  assert.doesNotMatch(
    `${fixturePublica}\n${fixtureRealSanitizada}`,
    /password|tokenRetornoAutenticacao|Bearer\s/iu,
  );
});

test('aplicação registra apenas a porta MK de consultas', async () => {
  const [aplicacao, modulo] = await Promise.all([
    ler('apps/api/src/modulo-aplicacao.ts'),
    ler('apps/api/src/erp/modulo-consultas-erp.ts'),
  ]);
  assert.match(aplicacao, /ModuloConsultasErp\.registrar\(\)/u);
  assert.match(modulo, /provide: CONSULTAS_ERP/u);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP/u);
});
