import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { ValidadorCaracterizacaoMkSolutions } from '../dist/erp/adaptadores/mk-solutions/caracterizacao-mk-solutions.js';

const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/mk-solutions/caracterizacao-publica-sanitizada.json', import.meta.url),
    'utf8',
  ),
);

test('aceita evidência pública sanitizada sem promover integração real', () => {
  const validador = new ValidadorCaracterizacaoMkSolutions();
  const caracterizacao = validador.ler(fixture);
  assert.equal(caracterizacao.operacoes.length, 11);
  assert.equal(caracterizacao.origemEvidencia, 'FIXTURE_PUBLICA_SANITIZADA');
  assert.equal(validador.podeAtivar(caracterizacao), false);
  assert.ok(
    caracterizacao.operacoes.every(
      ({ dtoResposta, erros, resposta }) =>
        dtoResposta === 'NAO_CONGELADO' &&
        erros === 'NAO_OBSERVADA' &&
        resposta === 'NAO_OBSERVADA',
    ),
  );
});

test('campo externo, capacidade ausente ou origem pública não contorna o portão', () => {
  const validador = new ValidadorCaracterizacaoMkSolutions();
  assert.throws(
    () => validador.ler({ ...fixture, token: 'segredo' }),
    /CAMPO_MK_NAO_CARACTERIZADO/u,
  );
  assert.throws(
    () => validador.ler({ ...fixture, operacoes: fixture.operacoes.slice(1) }),
    /CAPACIDADE_MK_AUSENTE/u,
  );
  const aparentementeObservada = {
    ...fixture,
    operacoes: fixture.operacoes.map((operacao) => ({
      ...operacao,
      dtoResposta: 'OBSERVADO_SANITIZADO',
      erros: 'OBSERVADA_SANITIZADA',
      paginacao: 'OBSERVADA_SANITIZADA',
      resposta: 'OBSERVADA_SANITIZADA',
    })),
  };
  assert.equal(
    validador.podeAtivar(validador.ler(aparentementeObservada)),
    false,
  );
});
