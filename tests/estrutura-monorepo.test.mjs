import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const arquivosObrigatorios = [
  '.github/workflows/integracao-continua.yml',
  '.github/gitleaks.toml',
  '.github/gitleaksignore',
  'apps/api/package.json',
  'apps/api/src/main.ts',
  'apps/mobile/package.json',
  'apps/mobile/scripts/executar-expo.mjs',
  'apps/mobile/src/Aplicacao.tsx',
  'apps/web/package.json',
  'apps/web/src/main.tsx',
  'configuracao/excecoes-auditoria.json',
  'eslint.config.mjs',
  'packages/eslint-config/package.json',
  'packages/typescript-config/package.json',
  'pnpm-workspace.yaml',
  'scripts/auditoria-dependencias.mjs',
  'scripts/executar-turbo.mjs',
  'scripts/verificar-dependencias.mjs',
  'scripts/verificar-segredos.mjs',
  'turbo.json',
];

const diretoriosIgnorados = new Set([
  '.expo',
  'android',
  'coverage',
  'dist',
  'ios',
  'node_modules',
]);

async function listarArquivos(diretorio) {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const arquivos = [];

  for (const entrada of entradas) {
    if (diretoriosIgnorados.has(entrada.name)) {
      continue;
    }

    const caminho = join(diretorio, entrada.name);

    if (entrada.isDirectory()) {
      arquivos.push(...(await listarArquivos(caminho)));
    } else if (entrada.isFile()) {
      arquivos.push(caminho);
    }
  }

  return arquivos;
}

test('mantém a estrutura mínima do monorepo', async () => {
  await Promise.all(arquivosObrigatorios.map((arquivo) => access(arquivo)));
});

test('expõe os comandos obrigatórios na raiz', async () => {
  const conteudo = await readFile('package.json', 'utf8');
  const manifesto = JSON.parse(conteudo);

  for (const comando of [
    'build',
    'lint',
    'test',
    'typecheck',
    'verificar:dependencias',
    'verificar:expo',
    'verificar:segredos',
  ]) {
    assert.equal(typeof manifesto.scripts?.[comando], 'string');
  }

  assert.equal(
    manifesto.scripts.test,
    'node scripts/executar-turbo.mjs test && node --test "tests/*.test.mjs"',
  );
});

test('workspace com arquivo de teste declara como executá-lo', async () => {
  for (const grupo of ['apps', 'packages']) {
    const workspaces = await readdir(grupo, { withFileTypes: true });

    for (const workspace of workspaces.filter((entrada) => entrada.isDirectory())) {
      const diretorio = join(grupo, workspace.name);
      const arquivos = await listarArquivos(diretorio);
      const possuiTeste = arquivos.some((arquivo) =>
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(arquivo),
      );

      if (possuiTeste) {
        const manifesto = JSON.parse(
          await readFile(join(diretorio, 'package.json'), 'utf8'),
        );
        assert.equal(
          typeof manifesto.scripts?.test,
          'string',
          `${diretorio} possui teste que o Turbo não executaria`,
        );
      }
    }
  }
});
