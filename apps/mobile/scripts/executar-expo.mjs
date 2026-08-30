import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const comandosPermitidos = new Set([
  'export',
  'install',
  'run:android',
  'run:ios',
  'start',
]);
const [comando, ...argumentos] = process.argv.slice(2);

if (comando === undefined || !comandosPermitidos.has(comando)) {
  throw new Error('COMANDO_EXPO_INVALIDO');
}

const require = createRequire(import.meta.url);
const raizPacote = dirname(require.resolve('expo/package.json'));
const entradaExpo = join(raizPacote, 'bin', 'cli');
const resultado = spawnSync(process.execPath, [entradaExpo, comando, ...argumentos], {
  env: {
    ...process.env,
    ...(comando === 'install' ? { CI: '1' } : {}),
    DO_NOT_TRACK: '1',
    EXPO_NO_TELEMETRY: '1',
  },
  stdio: 'inherit',
});

if (resultado.error !== undefined) {
  throw resultado.error;
}

process.exitCode = resultado.status ?? 1;
