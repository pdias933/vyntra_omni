import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const arquivosObrigatorios = [
  '.dockerignore',
  '.github/workflows/integracao-continua.yml',
  '.github/gitleaks.toml',
  '.github/gitleaksignore',
  'apps/api/Dockerfile',
  'apps/api/package.json',
  'apps/api/src/main.ts',
  'apps/mobile/package.json',
  'apps/mobile/scripts/executar-expo.mjs',
  'apps/mobile/src/Aplicacao.tsx',
  'apps/web/package.json',
  'apps/web/src/main.tsx',
  'compose.yaml',
  'configuracao/excecoes-auditoria.json',
  'eslint.config.mjs',
  'packages/eslint-config/package.json',
  'packages/typescript-config/package.json',
  'pnpm-workspace.yaml',
  'scripts/ambiente-local.mjs',
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

const estadosRoadmap = new Set([
  'BLOQUEADA',
  'CONDICIONAL',
  'CONCLUÍDA',
  'EM ANDAMENTO',
  'EM FORMALIZAÇÃO',
  'PENDENTE',
  'PRONTA',
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
    'ambiente:estado',
    'ambiente:parar',
    'ambiente:preparar',
    'ambiente:subir',
    'ambiente:validar',
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

test('acompanha estado e Effort de todas as PRs do roadmap', async () => {
  const conteudo = await readFile('ROADMAP.md', 'utf8');
  const inicioPainel = conteudo.indexOf('### Painel de execução');
  const fimPainel = conteudo.indexOf('\n## 2. Portão zero', inicioPainel);

  assert.ok(inicioPainel >= 0);
  assert.ok(fimPainel > inicioPainel);

  const linhas = conteudo
    .slice(inicioPainel, fimPainel)
    .split(/\r?\n/)
    .filter((linha) => /^\| \d{3} \|/.test(linha))
    .map((linha) => linha.split('|').map((parte) => parte.trim()))
    .map(([, numero, estado, effort]) => ({
      effort: effort.replaceAll('`', ''),
      estado,
      numero,
    }));

  assert.deepEqual(
    linhas.map(({ numero }) => numero),
    Array.from({ length: 116 }, (_, indice) =>
      String(indice + 1).padStart(3, '0'),
    ),
  );

  for (const { effort, estado, numero } of linhas) {
    assert.ok(estadosRoadmap.has(estado), `${numero}:${estado}`);
    assert.match(effort, /^(?:low|medium|high|xhigh)$/, numero);
  }

  const porNumero = new Map(linhas.map((linha) => [linha.numero, linha]));
  assert.equal(porNumero.get('001').estado, 'EM FORMALIZAÇÃO');
  assert.equal(porNumero.get('002').estado, 'CONCLUÍDA');
  assert.equal(porNumero.get('003').estado, 'CONCLUÍDA');
  assert.equal(porNumero.get('004').estado, 'CONCLUÍDA');
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
