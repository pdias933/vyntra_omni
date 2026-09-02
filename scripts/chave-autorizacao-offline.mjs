import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';
import { chmod, lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const nomeArquivoChaveAutorizacaoOffline = 'chave-autorizacao-offline.pem';
const modoArquivoChaveAutorizacaoOffline = 0o640;

function obterCodigoErro(erro) {
  if (typeof erro !== 'object' || erro === null || !('code' in erro)) {
    return undefined;
  }
  return erro.code;
}

function validarIdentificadorChave(identificador) {
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(identificador)) {
    throw new Error('IDENTIFICADOR_CHAVE_AUTORIZACAO_OFFLINE_INVALIDO');
  }
}

function lerChavePrivada(conteudo) {
  if (conteudo.length < 100 || conteudo.length > 4_096) {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  let chave;
  try {
    chave = createPrivateKey(conteudo);
  } catch {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  if (chave.type !== 'private' || chave.asymmetricKeyType !== 'ed25519') {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  return chave;
}

async function validarChaveAutorizacaoOffline(diretorio) {
  const caminho = join(diretorio, nomeArquivoChaveAutorizacaoOffline);
  const estado = await lstat(caminho);
  if (!estado.isFile() || estado.isSymbolicLink()) {
    throw new Error('ARQUIVO_CHAVE_AUTORIZACAO_OFFLINE_INVALIDO');
  }
  if (
    process.platform !== 'win32' &&
    (estado.mode & 0o777) !== modoArquivoChaveAutorizacaoOffline
  ) {
    throw new Error('PERMISSAO_CHAVE_AUTORIZACAO_OFFLINE_INCORRETA');
  }
  return lerChavePrivada(await readFile(caminho, 'utf8'));
}

async function prepararChaveAutorizacaoOffline(diretorio) {
  const caminho = join(diretorio, nomeArquivoChaveAutorizacaoOffline);
  let arquivo;
  try {
    arquivo = await open(caminho, 'wx', modoArquivoChaveAutorizacaoOffline);
  } catch (erro) {
    if (obterCodigoErro(erro) !== 'EEXIST') throw erro;
    await validarChaveAutorizacaoOffline(diretorio);
    return false;
  }

  try {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    await arquivo.writeFile(pem, 'utf8');
  } finally {
    await arquivo.close();
  }
  if (process.platform !== 'win32') {
    await chmod(caminho, modoArquivoChaveAutorizacaoOffline);
  }
  await validarChaveAutorizacaoOffline(diretorio);
  return true;
}

async function obterConfiguracaoPublicaMobile(diretorio, identificador) {
  validarIdentificadorChave(identificador);
  const privada = await validarChaveAutorizacaoOffline(diretorio);
  const publica = createPublicKey(privada).export({ format: 'jwk' });
  if (
    publica.kty !== 'OKP' ||
    publica.crv !== 'Ed25519' ||
    typeof publica.x !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(publica.x)
  ) {
    throw new Error('CHAVE_PUBLICA_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  return JSON.stringify({ [identificador]: publica.x });
}

export {
  modoArquivoChaveAutorizacaoOffline,
  nomeArquivoChaveAutorizacaoOffline,
  obterConfiguracaoPublicaMobile,
  prepararChaveAutorizacaoOffline,
  validarChaveAutorizacaoOffline,
};
