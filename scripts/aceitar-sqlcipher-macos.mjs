import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compila a fonte já fixada no Expo; não instala outra biblioteca ou usa dados reais.
if (process.platform !== 'darwin') throw new Error('ACEITE_EXIGE_MACOS');
const require = createRequire(import.meta.url);
const fonte = join(dirname(require.resolve('expo-sqlite/package.json')), 'vendor/sqlcipher');
const temporario = mkdtempSync(join(tmpdir(), 'vyntra-aceite-sqlcipher-'));
const executavel = join(temporario, 'aceite');
function executar(comando, argumentos) {
  const resultado = spawnSync(comando, argumentos, { stdio: 'inherit' });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error('ACEITE_SQLCIPHER_FALHOU');
}
executar('xcrun', [
  '--sdk', 'macosx', 'clang', '-O1', '-w',
  '-DSQLITE_HAS_CODEC=1', '-DSQLCIPHER_CRYPTO_CC', '-DSQLITE_TEMP_STORE=2',
  '-DSQLITE_EXTRA_INIT=sqlcipher_extra_init', '-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown', '-DNDEBUG',
  '-I', fonte, join(fonte, 'sqlite3.c'),
  fileURLToPath(new URL('../tests/nativo/integridade-sqlcipher.c', import.meta.url)),
  '-framework', 'Security', '-framework', 'CoreFoundation', '-o', executavel,
]);
executar(executavel, [join(temporario, 'sintetico.db')]);
