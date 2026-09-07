import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Compila a fonte já fixada no Expo; não instala outra biblioteca ou usa dados reais.
if (process.platform !== 'darwin') throw new Error('ACEITE_EXIGE_MACOS');
const require = createRequire(import.meta.url);
const fonte = join(dirname(require.resolve('expo-sqlite/package.json')), 'vendor/sqlcipher');
const temporario = mkdtempSync(join(tmpdir(), 'vyntra-aceite-sqlcipher-'));
const executavel = join(temporario, 'aceite');
const fonteRepositorio = readFileSync(new URL('../apps/mobile/src/offline/repositorio-replica-local.ts', import.meta.url), 'utf8');
const arvore = ts.createSourceFile('replica.ts', fonteRepositorio, ts.ScriptTarget.Latest, true);
const migracoes = [];
function visitar(no, dentroMigration = false) {
  const dentro = dentroMigration || (ts.isMethodDeclaration(no) && no.name.getText(arvore) === 'migrar');
  if (dentro && ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === 'execAsync') {
    const argumento = no.arguments[0];
    if (!argumento || !ts.isNoSubstitutionTemplateLiteral(argumento)) throw new Error('MIGRATION_NAO_LITERAL');
    migracoes.push(`BEGIN IMMEDIATE;\n${argumento.text}\nCOMMIT;`);
  }
  ts.forEachChild(no, (filho) => visitar(filho, dentro));
}
visitar(arvore);
if (migracoes.length !== 5) throw new Error('MATRIZ_MIGRATIONS_LOCAL_ALTERADA');
const arquivoMigracoes = join(temporario, 'migracoes.sql');
writeFileSync(arquivoMigracoes, migracoes.join('\n'), { mode: 0o600, flag: 'wx' });
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
executar(executavel, [join(temporario, 'sintetico.db'), arquivoMigracoes]);
