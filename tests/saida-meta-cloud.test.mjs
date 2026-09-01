import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const saida = await readFile(new URL('../apps/api/src/mensageria/adaptadores/meta-cloud/saida-meta-cloud.ts', import.meta.url), 'utf8');
const despachante = await readFile(new URL('../apps/api/src/mensagens/despachante-mensagem.ts', import.meta.url), 'utf8');

test('vocabulário HTTP/Meta permanece no adapter', () => {
  assert.match(saida, /messaging_product: 'whatsapp'/u);
  assert.match(saida, /graphApiVersion/u);
  assert.match(saida, /130_429/u);
  assert.doesNotMatch(despachante, /whatsapp|graph|wamid|http/iu);
});

test('despachante aceita, reagenda ou encerra por resultados internos distintos', () => {
  assert.match(despachante, /resultado\.resultado === 'ACEITA'/u);
  assert.match(despachante, /resultado\.categoria === 'TEMPORARIA'/u);
  assert.match(despachante, /registrarFalhaDefinitiva/u);
  assert.ok(despachante.indexOf('canal.enviar') < despachante.indexOf('aceitarEnvio'));
});
