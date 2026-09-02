import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
} from 'node:fs';
import { appendFile, lstat, open, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

export const CABECALHO_BACKUP = Buffer.from('VYNTRA-BACKUP-1\n', 'ascii');
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

export async function lerChaveBackup(caminho) {
  const estadoCaminho = await lstat(caminho);
  if (estadoCaminho.isSymbolicLink()) throw new Error('CHAVE_BACKUP_PERMISSAO_INVALIDA');
  const arquivo = await open(caminho, 'r');
  try {
    const estado = await arquivo.stat();
    if (!estado.isFile() || (process.platform !== 'win32' && (estado.mode & 0o077) !== 0)) {
      throw new Error('CHAVE_BACKUP_PERMISSAO_INVALIDA');
    }
  } finally {
    await arquivo.close();
  }

  const texto = (await readFile(caminho, 'utf8')).trim();
  const chave = Buffer.from(texto, 'base64url');
  if (chave.length !== 32 || chave.toString('base64url') !== texto) {
    throw new Error('CHAVE_BACKUP_INVALIDA');
  }
  return chave;
}

export async function criptografarFluxo({ entrada, destino, chave, iv }) {
  const vetor = iv ?? randomBytes(TAMANHO_IV);
  const cipher = createCipheriv('aes-256-gcm', chave, vetor);
  const saida = createWriteStream(destino, { flags: 'wx', mode: 0o600 });
  saida.write(CABECALHO_BACKUP);
  saida.write(vetor);
  await pipeline(entrada, cipher, saida);
  await appendFile(destino, cipher.getAuthTag(), { mode: 0o600 });
}

export async function descriptografarArquivo({ origem, destino, chave }) {
  const arquivo = await open(origem, 'r');
  let estado;
  let prefixo;
  let tag;
  try {
    estado = await arquivo.stat();
    const minimo = CABECALHO_BACKUP.length + TAMANHO_IV + TAMANHO_TAG + 1;
    if (!estado.isFile() || estado.size < minimo) throw new Error('BACKUP_TRUNCADO');
    prefixo = Buffer.alloc(CABECALHO_BACKUP.length + TAMANHO_IV);
    await arquivo.read(prefixo, 0, prefixo.length, 0);
    tag = Buffer.alloc(TAMANHO_TAG);
    await arquivo.read(tag, 0, tag.length, estado.size - TAMANHO_TAG);
  } finally {
    await arquivo.close();
  }
  if (!prefixo.subarray(0, CABECALHO_BACKUP.length).equals(CABECALHO_BACKUP)) {
    throw new Error('BACKUP_FORMATO_INVALIDO');
  }

  const iv = prefixo.subarray(CABECALHO_BACKUP.length);
  const decipher = createDecipheriv('aes-256-gcm', chave, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(origem, {
      start: CABECALHO_BACKUP.length + TAMANHO_IV,
      end: estado.size - TAMANHO_TAG - 1,
    }),
    decipher,
    createWriteStream(destino, { flags: 'wx', mode: 0o600 }),
  );
}

export async function sha256Arquivo(caminho) {
  const hash = createHash('sha256');
  for await (const bloco of createReadStream(caminho)) hash.update(bloco);
  return hash.digest('hex');
}
