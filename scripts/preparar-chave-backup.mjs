import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminho = process.env.VYNTRA_BACKUP_CHAVE_FILE;
if (typeof caminho !== 'string' || !isAbsolute(caminho) || caminho.startsWith(`${raiz}/`)) {
  throw new Error('CAMINHO_CHAVE_BACKUP_EXTERNO_ABSOLUTO_OBRIGATORIO');
}
await mkdir(dirname(caminho), { recursive: true, mode: 0o700 });
const diretorio = await lstat(dirname(caminho));
if (!diretorio.isDirectory() || diretorio.isSymbolicLink() || (diretorio.mode & 0o077) !== 0) {
  throw new Error('DIRETORIO_CHAVE_BACKUP_INSEGURO');
}
const arquivo = await open(caminho, 'wx', 0o600);
try {
  await arquivo.writeFile(`${randomBytes(32).toString('base64url')}\n`, 'utf8');
} finally {
  await arquivo.close();
}
process.stdout.write('CHAVE_BACKUP_CRIADA_SEM_EXIBIR_CONTEUDO\n');
