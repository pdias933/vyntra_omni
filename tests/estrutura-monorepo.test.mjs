import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const arquivosObrigatorios = [
  'apps/api/package.json',
  'apps/api/src/main.ts',
  'apps/mobile/package.json',
  'apps/mobile/scripts/executar-expo.mjs',
  'apps/mobile/src/Aplicacao.tsx',
  'apps/web/package.json',
  'apps/web/src/main.tsx',
  'eslint.config.mjs',
  'packages/eslint-config/package.json',
  'packages/typescript-config/package.json',
  'pnpm-workspace.yaml',
  'scripts/executar-turbo.mjs',
  'turbo.json',
];

test('mantém a estrutura mínima do monorepo', async () => {
  await Promise.all(arquivosObrigatorios.map((arquivo) => access(arquivo)));
});

test('expõe os comandos obrigatórios na raiz', async () => {
  const conteudo = await readFile('package.json', 'utf8');
  const manifesto = JSON.parse(conteudo);

  for (const comando of ['build', 'lint', 'test', 'typecheck']) {
    assert.equal(typeof manifesto.scripts?.[comando], 'string');
  }
});
