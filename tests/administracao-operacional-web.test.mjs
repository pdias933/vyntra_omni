import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('painel operacional resolve RBAC por capacidade e falha fechado sem adaptadores', async () => {
  const servico = await ler('apps/api/src/administracao-operacional/servico-administracao-operacional.ts');
  assert.ok(servico.indexOf('const capacidades') < servico.indexOf('transacao.contaWhatsApp.findMany'));
  assert.match(servico, /ADMINISTRAR_INTEGRACOES/u);
  assert.match(servico, /ADMINISTRAR_FILAS/u);
  assert.match(servico, /ADMINISTRAR_CALENDARIOS/u);
  assert.match(servico, /Adaptador de produção não configurado/u);
  assert.doesNotMatch(servico, /process\.env/u);
});

test('web usa SDK gerado e confirma inativação de fila', async () => {
  const tela = await ler('apps/web/src/web/administracao/AdministracaoOperacionalWeb.tsx');
  assert.match(tela, /listarAdministracaoOperacional/u);
  assert.match(tela, /criarFilaAdministracaoOperacional/u);
  assert.match(tela, /Confirmar inativação/u);
  assert.match(tela, /definirOverrideCalendarioAdministracaoOperacional/u);
  assert.match(tela, /estado === 'PARCIAL' \? 'Parcial'/u);
  assert.doesNotMatch(tela, /fetch\(/u);
});
