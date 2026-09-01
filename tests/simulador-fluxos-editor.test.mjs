import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('simulador é puro, limitado e não importa integrações ou runtime', async () => {
  const simulador = await ler('apps/api/src/fluxos/simulador-fluxos.ts');
  assert.match(simulador, /LIMITE_PASSOS = 200/);
  assert.match(simulador, /efeitosReaisExecutados: false/);
  assert.match(simulador, /Cliente fictício/);
  assert.doesNotMatch(
    simulador,
    /adaptador|ServicoMensagensSaida|ServicoConsultasErp|fetch\(|axios|Prisma|Redis|Meta|MK/,
  );
});

test('endpoint de simulação exige sessão web, origem, CSRF e TESTAR_FLUXO', async () => {
  const [controlador, editor] = await Promise.all([
    ler('apps/api/src/fluxos/controlador-editor-fluxos.ts'),
    ler('apps/api/src/fluxos/servico-editor-fluxos.ts'),
  ]);
  assert.match(controlador, /@Post\('simular'\)/);
  assert.match(controlador, /this\.origens\.validar/);
  assert.match(controlador, /obterTokenCsrfWeb/);
  assert.match(controlador, /executarComSessaoAtual/);
  assert.match(editor, /'TESTAR_FLUXO'/);
  assert.match(editor, /interpretarRascunho/);
});

test('editor simula o rascunho corrente com painel fictício e passos visíveis', async () => {
  const [editor, estilos] = await Promise.all([
    ler('apps/web/src/editor/EditorFluxo.tsx'),
    ler('apps/web/src/estilos.css'),
  ]);
  assert.match(editor, /> Testar/);
  assert.match(editor, /aoSimular\(definicaoAtual\(\), cenarioSimulacao\)/);
  assert.match(editor, /Somente dados fictícios/);
  assert.match(editor, /Passos percorridos/);
  assert.match(editor, /Zero efeitos reais executados/);
  assert.match(estilos, /\.simulador-fluxo/);
  assert.match(estilos, /@media \(prefers-reduced-motion: reduce\)/);
});
