import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('editor usa SDK gerado, XYFlow e comandos explícitos separados', async () => {
  const [aplicacao, editor, pacote, cliente] = await Promise.all([
    ler('apps/web/src/Aplicacao.tsx'),
    ler('apps/web/src/editor/EditorFluxo.tsx'),
    ler('apps/web/package.json'),
    ler('packages/api-client/src/gerado/index.ts'),
  ]);
  assert.match(pacote, /"@xyflow\/react": "12\.11\.6"/);
  assert.match(aplicacao, /@vyntra\/api-client/);
  assert.doesNotMatch(aplicacao, /fetch\(/);
  assert.match(editor, /Salvar rascunho/);
  assert.match(editor, /Validar versão/);
  assert.match(editor, /Publicar versão/);
  assert.match(editor, /Criar novo rascunho/);
  assert.match(editor, /Histórico de versões/);
  assert.match(editor, /Restaurar em produção/);
  assert.match(cliente, /salvarRascunhoFluxoEditor/);
  assert.match(cliente, /prepararPublicacaoFluxoEditor/);
  assert.match(cliente, /publicarVersaoFluxoEditor/);
  assert.match(cliente, /reverterVersaoFluxoEditor/);
});

test('API do editor exige sessão, origem, CSRF, RBAC e revisão', async () => {
  const [controlador, servico] = await Promise.all([
    ler('apps/api/src/fluxos/controlador-editor-fluxos.ts'),
    ler('apps/api/src/fluxos/servico-editor-fluxos.ts'),
  ]);
  assert.match(controlador, /ApiCookieAuth\('sessaoWeb'\)/);
  assert.match(controlador, /NOME_HEADER_CSRF_WEB/);
  assert.match(controlador, /this\.origens\.validar/);
  assert.match(controlador, /executarComSessaoAtual/);
  assert.match(servico, /VISUALIZAR_FLUXO/);
  assert.match(servico, /EDITAR_FLUXO/);
  assert.match(servico, /PUBLICAR_FLUXO/);
  assert.match(servico, /this\.publicacao\.reverter/);
  assert.match(servico, /validarRascunho/);
  assert.doesNotMatch(servico, /JSON\.parse|eval\(|new Function|https?:\/\//);
});

test('visual é desktop próprio e respeita reduzir movimento', async () => {
  const [estilos, referencias] = await Promise.all([
    ler('apps/web/src/estilos.css'),
    ler('design/references/README.md'),
  ]);
  assert.match(estilos, /grid-template-columns: 252px minmax\(520px, 1fr\) 304px/);
  assert.match(estilos, /prefers-reduced-motion: reduce/);
  assert.match(estilos, /--verde/);
  assert.match(referencias, /linguagem, a hierarquia e o comportamento/);
  assert.doesNotMatch(estilos, /animation-duration: [1-9][0-9]*s/);
});
