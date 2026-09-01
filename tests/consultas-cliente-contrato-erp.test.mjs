import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('porta ERP possui busca e detalhes em vocabulário interno', async () => {
  const porta = await readFile(new URL('apps/api/src/erp/adaptador-erp.ts', raiz), 'utf8');
  assert.match(porta, /localizarClientes/);
  assert.match(porta, /consultarCliente/);
  assert.match(porta, /listarContratos/);
  assert.match(porta, /consultarContrato/);
  assert.doesNotMatch(porta, /MkSolutions|WSMK|raw_/);
});

test('serviço de consulta não conhece fornecedor nem DTO externo', async () => {
  const servico = await readFile(
    new URL('apps/api/src/erp/servico-consultas-cliente-contrato-erp.ts', raiz),
    'utf8',
  );
  assert.doesNotMatch(servico, /MkSolutions|WSMK|raw_|endpoint|token/);
  assert.match(servico, /RESPOSTA_CONSULTA_ERP_INVALIDA/);
  assert.match(servico, /TEMPO_REAL/);
});
