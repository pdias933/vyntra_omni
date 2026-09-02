import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from 'yaml';

const composeTexto = await readFile('compose.staging.yaml', 'utf8');
const compose = parse(composeTexto);
const deploy = await readFile('scripts/deploy-compativel.mjs', 'utf8');
const principal = await readFile('apps/api/src/main.ts', 'utf8');
const prontidao = await readFile('apps/api/src/saude/servico-prontidao.ts', 'utf8');
const sse = await readFile('apps/api/src/sincronizacao/registro-conexoes-sse.ts', 'utf8');
const websocket = await readFile('apps/api/src/sincronizacao/gateway-eventos-mobile.ts', 'utf8');
const worker = await readFile('apps/api/src/execucoes-fluxo/processo-recuperacao-execucoes-fluxo.ts', 'utf8');

test('release usa imagens imutáveis parametrizadas e job único de migration', () => {
  for (const nome of ['migrar', 'api', 'worker_fluxos', 'web', 'proxy']) {
    assert.match(compose.services[nome].image, /\$\{VYNTRA_RELEASE:-pr-112\}$/u);
  }
  assert.equal((deploy.match(/\['run', '--rm', '--no-deps', 'migrar'\]/gu) ?? []).length, 1);
  const publicar = deploy.slice(deploy.indexOf('function publicar'));
  assert.ok(publicar.indexOf("'migrar'") < publicar.indexOf('ativarImagens(alvo)'));
  assert.match(deploy, /VYNTRA_CONFIRMAR_DEPLOY/u);
  assert.match(deploy, /CONTEXTO_DOCKER_REMOTO_NAO_AUTORIZADO/u);
});

test('falha ou comando explícito reativa versão anterior sem reverter schema', () => {
  assert.match(deploy, /if \(anterior !== undefined\) ativarImagens\(anterior\)/u);
  assert.match(deploy, /case 'reverter'/u);
  const blocoReverter = deploy.slice(deploy.indexOf("case 'reverter'"));
  assert.doesNotMatch(blocoReverter, /'migrar'/u);
  assert.doesNotMatch(deploy, /migrate reset|migrate down|DROP\s/u);
});

test('API drena prontidão, SSE e WebSocket antes do limite do contêiner', () => {
  assert.ok(principal.indexOf('encerrarAplicacaoGraciosamente') < principal.indexOf("process.once('SIGTERM'"));
  assert.match(prontidao, /DRENAGEM_APLICACAO/u);
  assert.match(sse, /onModuleDestroy/u);
  assert.match(websocket, /SERVIDOR_ENCERRANDO/u);
  assert.equal(compose.services.api.stop_grace_period, '25s');
});

test('worker acorda, conclui o ciclo adquirido e recebe prazo próprio', () => {
  assert.match(worker, /solicitarDrenagem/u);
  assert.match(worker, /clearTimeout\(temporizador\)/u);
  assert.equal(compose.services.worker_fluxos.stop_grace_period, '30s');
});
