import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('caracterização MK usa fontes oficiais e registra lacunas sem inventar DTO', async () => {
  const [documento, caracterizacao, fixture] = await Promise.all([
    ler('docs/integracoes/PR-059-CARACTERIZACAO-MK-SOLUTIONS.md'),
    ler(
      'apps/api/src/erp/adaptadores/mk-solutions/caracterizacao-mk-solutions.ts',
    ),
    ler(
      'apps/api/test/fixtures/mk-solutions/caracterizacao-publica-sanitizada.json',
    ),
  ]);
  assert.match(documento, /mkloud\.atlassian\.net\/wiki/u);
  assert.match(documento, /não foi fornecido.*ambiente MK/iu);
  assert.match(documento, /paginação.*não.*documentada/iu);
  assert.match(caracterizacao, /FIXTURE_PUBLICA_SANITIZADA/u);
  assert.match(caracterizacao, /AMBIENTE_REAL/u);
  assert.match(fixture, /"dtoResposta": "NAO_CONGELADO"/u);
  assert.doesNotMatch(fixture, /password|tokenRetornoAutenticacao|Bearer\s/iu);
});

test('adapter MK não é registrado antes da observação real', async () => {
  const modulo = await ler('apps/api/src/modulo-aplicacao.ts');
  assert.ok(!/AdaptadorMkSolutions/u.test(modulo));
});
