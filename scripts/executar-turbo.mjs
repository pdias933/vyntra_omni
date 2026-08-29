import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const tarefasPermitidas = new Set(['build', 'dev', 'lint', 'test', 'typecheck']);
const tarefa = process.argv[2];

if (tarefa === undefined || !tarefasPermitidas.has(tarefa)) {
  throw new Error('TAREFA_TURBO_INVALIDA');
}

const require = createRequire(import.meta.url);
const raizPacote = dirname(require.resolve('turbo/package.json'));
const entradaTurbo = join(raizPacote, 'bin', 'turbo');
const resultado = spawnSync(
  process.execPath,
  [entradaTurbo, 'run', tarefa, '--cache=local:rw'],
  {
    env: {
      ...process.env,
      DO_NOT_TRACK: '1',
      TURBO_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  },
);

if (resultado.error !== undefined) {
  throw resultado.error;
}

process.exitCode = resultado.status ?? 1;
