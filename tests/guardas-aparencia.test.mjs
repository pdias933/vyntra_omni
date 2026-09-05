import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { TEMAS } from '../packages/tema/src/index.ts';

const raiz = new URL('../', import.meta.url);
async function arquivos(pasta) {
  const entradas = await readdir(pasta, { withFileTypes: true });
  const grupos = await Promise.all(entradas.map((entrada) => {
    const url = new URL(entrada.name + (entrada.isDirectory() ? '/' : ''), pasta);
    return entrada.isDirectory() ? arquivos(url) : [url];
  }));
  return grupos.flat();
}

test('componentes não reintroduzem cores literais ou paleta clara estática', async () => {
  for (const pasta of ['apps/mobile/src/', 'apps/web/src/']) {
    for (const url of await arquivos(new URL(pasta, raiz))) {
      if (!/\.(tsx|css)$/.test(url.pathname)) continue;
      const conteudo = await readFile(url, 'utf8');
      assert.doesNotMatch(conteudo, /#[\da-f]{6}\b|rgba?\(\s*\d/i, url.pathname);
      assert.doesNotMatch(conteudo, /import\s*\{[^}]*\bCORES\b[^}]*\}\s*from\s*['"][^'"]*tema['"]/u, url.pathname);
    }
  }
});

test('variáveis web referenciam apenas tokens presentes nas duas paletas', async () => {
  const css = await readFile(new URL('apps/web/src/estilos.css', raiz), 'utf8');
  for (const [, nome] of css.matchAll(/var\(--cor-(\w+)\)/g)) {
    assert.ok(nome in TEMAS.claro && nome in TEMAS.escuro, nome);
  }
});

test('configuração nativa inclui tema automático e abertura equivalente aos tokens', async () => {
  const manifesto = JSON.parse(await readFile(new URL('apps/mobile/app.json', raiz), 'utf8')).expo;
  assert.equal(manifesto.userInterfaceStyle, 'automatic');
  assert.ok(manifesto.plugins.includes('expo-system-ui'));
  const abertura = manifesto.plugins.find((item) => Array.isArray(item) && item[0] === 'expo-splash-screen')[1];
  assert.equal(abertura.backgroundColor, TEMAS.claro.fundo);
  assert.equal(abertura.dark.backgroundColor, TEMAS.escuro.fundo);
});

test('imagem web inclui pacote e bootstrap públicos, com revalidação sem enfraquecer CSP', async () => {
  const dockerfile = await readFile(new URL('apps/web/Dockerfile', raiz), 'utf8');
  for (const caminho of ['packages/tema/package.json', 'packages/tema/tsconfig.json', 'packages/tema/src', 'apps/web/public']) {
    assert.ok(dockerfile.includes(`COPY ${caminho} ${caminho}`), caminho);
  }
  const contexto = await readFile(new URL('.dockerignore', raiz), 'utf8');
  for (const permitido of ['packages/tema', 'packages/tema/package.json', 'packages/tema/tsconfig.json', 'packages/tema/src', 'packages/tema/src/**/*.ts', 'apps/web/public', 'apps/web/public/*.css', 'apps/web/public/*.js', 'apps/web/src/**/*.css']) {
    assert.ok(contexto.split('\n').includes(`!${permitido}`), permitido);
  }
  const caddy = await readFile(new URL('infra/staging/Caddyfile.web', raiz), 'utf8');
  assert.match(caddy, /@aparencia path \/temas\.css \/aparencia-inicial\.js/u);
  assert.match(caddy, /header @aparencia Cache-Control "no-cache, must-revalidate"/u);
  const index = await readFile(new URL('apps/web/index.html', raiz), 'utf8');
  assert.ok(index.indexOf('/aparencia-inicial.js') < index.indexOf('/temas.css'));
  assert.doesNotMatch(index, /<script\b[^>]*>\s*[^<\s]/u);
});
