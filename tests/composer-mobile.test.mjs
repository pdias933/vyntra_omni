import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('rotas de composição mobile revalidam aparelho e delegam ao domínio', async () => {
  const [controlador, modulo] = await Promise.all([
    ler('apps/api/src/console-mobile/controlador-console-mobile.ts'),
    ler('apps/api/src/console-web/modulo-console-web.ts'),
  ]);
  assert.match(controlador, /listarRespostasRapidasMobile/u);
  assert.match(controlador, /listarModelosAprovadosMobile/u);
  assert.match(controlador, /enviarTextoMobile/u);
  assert.match(controlador, /enviarModeloAprovadoMobile/u);
  assert.match(controlador, /this\.autenticacao\.executarComSessaoAtual/u);
  assert.match(controlador, /this\.composer\.enviarTexto/u);
  assert.match(controlador, /this\.composer\.enviarModelo/u);
  assert.match(modulo, /exports: \[ServicoComposerWeb/u);
});

test('adapter de composição usa SDK gerado e contratos fechados', async () => {
  const [adaptador, modelo] = await Promise.all([
    ler('apps/mobile/src/atendimentos/adaptador-atendimentos-http.ts'),
    ler('apps/mobile/src/atendimentos/modelo-atendimento-mobile.ts'),
  ]);
  for (const operacao of [
    'listarRespostasRapidasMobile',
    'listarModelosAprovadosMobile',
    'enviarTextoMobile',
    'enviarModeloAprovadoMobile',
  ]) assert.match(adaptador, new RegExp(operacao, 'u'));
  assert.doesNotMatch(adaptador, /fetch\(/u);
  assert.match(modelo, /normalizarRespostasRapidasMobile/u);
  assert.match(modelo, /normalizarModelosAprovadosMobile/u);
  assert.match(modelo, /normalizarMensagemCriadaMobile/u);
});

test('rascunho é local, limitado, substituível e removido somente quando vazio', async () => {
  const repositorio = await ler('apps/mobile/src/offline/repositorio-replica-local.ts');
  assert.match(repositorio, /public async obterRascunho/u);
  assert.match(repositorio, /public async salvarRascunho/u);
  assert.match(repositorio, /texto\.length > 4_096/u);
  assert.match(repositorio, /ON CONFLICT\(conversa_id\) DO UPDATE/u);
  assert.match(repositorio, /DELETE FROM rascunho WHERE conversa_id = \?/u);
});

test('composer abre barra de respostas, preserva texto em falha e prioriza envio', async () => {
  const composer = await ler('apps/mobile/src/componentes/ComposerMobile.tsx');
  assert.match(composer, /texto\.startsWith\('\/'\)/u);
  assert.match(composer, /listarRespostasRapidas/u);
  assert.match(composer, /salvarRascunho/u);
  assert.match(composer, /O texto foi preservado/u);
  assert.match(composer, /possuiTexto \? \(/u);
  assert.match(composer, /accessibilityLabel="Enviar mensagem"/u);
  assert.match(composer, /accessibilityLabel="Ações do sistema"/u);
});

test('janela encerrada oferece mensagem aprovada e ações usam folha categorizada', async () => {
  const [composer, folhaAcoes] = await Promise.all([
    ler('apps/mobile/src/componentes/ComposerMobile.tsx'),
    ler('apps/mobile/src/componentes/FolhaAcoesSistemaMobile.tsx'),
  ]);
  assert.match(composer, /Janela Meta encerrada/u);
  assert.match(composer, /Escolher mensagem/u);
  assert.match(composer, /Mensagens aprovadas/u);
  assert.match(folhaAcoes, /Cliente e financeiro/u);
  assert.match(folhaAcoes, /Suporte/u);
  assert.match(folhaAcoes, /Atendimento/u);
  assert.match(composer, /useReducedMotion/u);
  assert.match(composer, /reduzirMovimento \? 'fade' : 'slide'/u);
  assert.doesNotMatch(composer, /fetch\(/u);
});
