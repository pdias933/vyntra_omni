import { spawnSync } from 'node:child_process';

const executorPnpm = process.env.npm_execpath;

if (!executorPnpm) {
  throw new Error('EXECUTOR_PNPM_NAO_IDENTIFICADO');
}

for (const argumentos of [
  ['--filter', '@vyntra/api', 'build'],
  ['--filter', '@vyntra/api', 'gerar:openapi'],
  ['--filter', '@vyntra/api-client', 'gerar'],
]) {
  const resultado = spawnSync(process.execPath, [executorPnpm, ...argumentos], {
    stdio: 'inherit',
  });

  if (resultado.status !== 0) {
    process.exit(resultado.status ?? 1);
  }
}
