import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('porta ERP separa consultas e escritas usando termos internos', async () => {
  const [porta, modelo] = await Promise.all([
    ler('apps/api/src/erp/adaptador-erp.ts'),
    ler('apps/api/src/erp/modelo-erp.ts'),
  ]);
  assert.match(porta, /interface ConsultasErp/);
  assert.match(porta, /interface EscritasErp/);
  assert.match(porta, /interface AdaptadorErp extends ConsultasErp, EscritasErp/);
  assert.match(modelo, /TEMPO_REAL/);
  assert.match(modelo, /RESULTADO_INCERTO/);
  assert.match(modelo, /RESPOSTA_PERDIDA/);
  assert.ok(!porta.includes('MkSolutions'));
  assert.ok(!modelo.includes('protocoloLocal'));
});

test('simulador distingue indisponibilidade de resposta perdida', async () => {
  const simulador = await ler(
    'apps/api/src/erp/simuladores/adaptador-erp-simulado.ts',
  );
  assert.match(simulador, /ERP_INDISPONIVEL/);
  assert.match(simulador, /PERDER_RESPOSTA/);
  assert.match(simulador, /reconciliarCriacaoAtendimento/);
  assert.match(simulador, /efeitosCriacao/);
  assert.ok(!simulador.includes('AccessSessionAdapter'));
  assert.ok(!simulador.includes('tokenMk'));
});

test('simulador ERP não é registrado como integração de produção', async () => {
  const modulo = await ler('apps/api/src/modulo-aplicacao.ts');
  assert.ok(!modulo.includes('AdaptadorErpSimulado'));
  assert.ok(!modulo.includes('ADAPTADOR_ERP'));
});
