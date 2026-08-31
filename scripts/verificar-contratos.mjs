import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const alvos = [
  'apps/api/openapi/openapi.json',
  'packages/api-client/src/gerado',
];

async function lerArquivos(caminho, arquivos = new Map()) {
  const caminhoAbsoluto = resolve(caminho);
  const estado = await stat(caminhoAbsoluto);

  if (estado.isFile()) {
    arquivos.set(
      relative(process.cwd(), caminhoAbsoluto),
      await readFile(caminhoAbsoluto, 'utf8'),
    );
    return arquivos;
  }

  const entradas = await readdir(caminhoAbsoluto, { withFileTypes: true });
  for (const entrada of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    await lerArquivos(resolve(caminhoAbsoluto, entrada.name), arquivos);
  }

  return arquivos;
}

async function capturarContratos() {
  const arquivos = new Map();
  for (const alvo of alvos) {
    await lerArquivos(alvo, arquivos);
  }
  return arquivos;
}

const executorPnpm = process.env.npm_execpath;
if (!executorPnpm) {
  throw new Error('EXECUTOR_PNPM_NAO_IDENTIFICADO');
}

const antes = await capturarContratos();
const resultado = spawnSync(process.execPath, [executorPnpm, 'gerar:contratos'], {
  stdio: 'inherit',
});

if (resultado.status !== 0) {
  process.exit(resultado.status ?? 1);
}

const depois = await capturarContratos();
const caminhos = new Set([...antes.keys(), ...depois.keys()]);
const divergentes = [...caminhos].filter(
  (caminho) => antes.get(caminho) !== depois.get(caminho),
);

if (divergentes.length > 0) {
  console.error(
    `Contratos gerados estavam desatualizados: ${divergentes.join(', ')}`,
  );
  process.exitCode = 1;
}
