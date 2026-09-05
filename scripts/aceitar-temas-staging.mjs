/* global document, getComputedStyle */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { TEMAS } from '../packages/tema/src/index.ts';

// Somente leitura, sem login, interceptação de API, pareamento ou efeito externo.
const origem = 'https://omni.up100.com.br';
const destino = new URL('../outputs/temas-validacao/staging/', import.meta.url);
const hash = (conteudo) => createHash('sha256').update(conteudo).digest('hex');
const evidencias = [];
for (const caminho of ['/temas.css', '/aparencia-inicial.js']) {
  const resposta = await fetch(origem + caminho, { signal: AbortSignal.timeout(15000), cache: 'no-cache' });
  assert.equal(resposta.status, 200, caminho);
  assert.match(resposta.headers.get('content-type'), caminho.endsWith('.css') ? /text\/css/ : /javascript/);
  assert.match(resposta.headers.get('cache-control'), /no-cache/);
  const esperado = await readFile(new URL('../apps/web/public' + caminho, import.meta.url));
  const recebido = Buffer.from(await resposta.arrayBuffer());
  assert.equal(hash(recebido), hash(esperado), caminho);
  evidencias.push({ caminho, sha256: hash(recebido), cache: resposta.headers.get('cache-control') });
}
const paginaInicial = await fetch(origem, { signal: AbortSignal.timeout(15000) });
assert.equal(paginaInicial.status, 200);
const csp = paginaInicial.headers.get('content-security-policy');
assert.match(csp, /script-src 'self'(?:;|$)/);
const prontidao = await fetch(origem + '/api/v1/saude/pronto', { signal: AbortSignal.timeout(15000) });
assert.equal(prontidao.status, 200);

const { chromium } = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
const navegador = await chromium.launch({ executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL, headless: true });
const erros = [];
await mkdir(destino, { recursive: true });
try {
  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  pagina.on('pageerror', (erro) => erros.push(erro.message));
  await pagina.goto(origem);
  await pagina.getByRole('combobox', { name: 'Aparência' }).waitFor();
  assert.equal(await pagina.locator('html').getAttribute('data-tema'), 'escuro');
  for (const modo of ['escuro', 'claro']) {
    await pagina.getByRole('combobox', { name: 'Aparência' }).selectOption(modo);
    const superficie = `rgb(${TEMAS[modo].superficie.slice(1).match(/../g).map(par => parseInt(par,16)).join(', ')})`;
    await pagina.waitForFunction(({modo, superficie}) => document.documentElement.dataset.tema === modo && getComputedStyle(document.querySelector('.tela-login')).backgroundColor === superficie, {modo, superficie});
    await pagina.screenshot({ path: new URL(`login-${modo}.png`, destino).pathname });
  }
  await pagina.reload();
  await pagina.getByRole('combobox', { name: 'Aparência' }).waitFor();
  assert.equal(await pagina.locator('html').getAttribute('data-tema'), 'claro');
  assert.equal(erros.length, 0, erros.join('\n'));
  const resultado = { passou: true, origem, navegador: await navegador.version(), prontidao: prontidao.status, csp, evidencias, erros };
  await writeFile(new URL('resultado.json', destino), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado));
} finally {
  await navegador.close();
}
