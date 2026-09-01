import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('financeiro exige tempo real e explicita completude dos complementos', async () => {
  const servico = await readFile(
    new URL('apps/api/src/erp/servico-financeiro-erp.ts', raiz),
    'utf8',
  );
  assert.match(servico, /TEMPO_REAL/);
  assert.match(servico, /COMPLETA.*PARCIAL/su);
  assert.match(servico, /NAO_FORNECIDO/);
  assert.doesNotMatch(servico, /SNAPSHOT|MkSolutions|WSMK|raw_/);
});

test('documento e pagamento são modelos internos sem URL externa', async () => {
  const modelo = await readFile(
    new URL('apps/api/src/erp/modelo-erp.ts', raiz),
    'utf8',
  );
  assert.match(modelo, /DocumentoFaturaErpNormalizado/);
  assert.match(modelo, /DadosPagamentoFaturaErpNormalizados/);
  assert.match(modelo, /conteudo: Uint8Array/);
  assert.doesNotMatch(modelo, /urlDocumento|base64|WSMK/);
});
