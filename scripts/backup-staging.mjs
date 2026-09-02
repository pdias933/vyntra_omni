import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  criptografarFluxo,
  lerChaveBackup,
  sha256Arquivo,
} from './lib/backup-criptografia.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(raiz, 'compose.staging.yaml');
const projeto = 'vyntra-staging';
const PADRAO_RELEASE = /^[a-z0-9][a-z0-9._-]{2,63}$/u;

function exigir(nome) {
  const valor = process.env[nome];
  if (typeof valor !== 'string' || valor.length === 0) throw new Error(`${nome}_AUSENTE`);
  return valor;
}

async function exigirDiretorioSeguro(caminho) {
  if (!isAbsolute(caminho) || caminho.startsWith(`${raiz}/`) || caminho === raiz) {
    throw new Error('DESTINO_BACKUP_DEVE_SER_EXTERNO_E_ABSOLUTO');
  }
  await mkdir(caminho, { recursive: true, mode: 0o700 });
  await chmod(caminho, 0o700);
  const estado = await lstat(caminho);
  if (!estado.isDirectory() || estado.isSymbolicLink() || (estado.mode & 0o077) !== 0) {
    throw new Error('DESTINO_BACKUP_INSEGURO');
  }
}

function executar(argumentos, opcoes = {}) {
  const processo = spawn(argumentos[0], argumentos.slice(1), {
    cwd: raiz,
    env: { ...process.env, COMPOSE_FILE: undefined, COMPOSE_PROJECT_NAME: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opcoes,
  });
  let erro = '';
  processo.stderr.on('data', (bloco) => { erro = `${erro}${bloco}`.slice(-4096); });
  const terminou = new Promise((resolveTermino, rejeitar) => {
    processo.once('error', rejeitar);
    processo.once('close', (codigo) => {
      if (codigo === 0) resolveTermino();
      else rejeitar(new Error(`BACKUP_COMANDO_FALHOU:${argumentos[0]}:${erro.trim()}`));
    });
  });
  return { processo, terminou };
}

async function executarSemSaida(argumentos) {
  const { processo, terminou } = executar(argumentos);
  processo.stdout.resume();
  await terminou;
}

async function criarArtefatoComando({ nome, argumentos, diretorio, chave }) {
  const caminho = join(diretorio, `${nome}.vyntra`);
  const { processo, terminou } = executar(argumentos);
  await Promise.all([
    criptografarFluxo({ entrada: processo.stdout, destino: caminho, chave }),
    terminou,
  ]);
  return {
    arquivo: basename(caminho),
    sha256_cifrado: await sha256Arquivo(caminho),
  };
}

async function principal() {
  const inicio = new Date();
  const release = exigir('VYNTRA_RELEASE');
  if (!PADRAO_RELEASE.test(release)) throw new Error('VYNTRA_RELEASE_INVALIDA');
  if (exigir('VYNTRA_BACKUP_DESTINO_EXTERNO') !== 'CONFIRMADO') {
    throw new Error('DESTINO_EXTERNO_NAO_CONFIRMADO');
  }
  const destinoRaiz = exigir('VYNTRA_BACKUP_DESTINO');
  await exigirDiretorioSeguro(destinoRaiz);
  const chave = await lerChaveBackup(exigir('VYNTRA_BACKUP_CHAVE_FILE'));
  const id = inicio.toISOString().replaceAll(':', '').replaceAll('.', '-');
  const diretorio = join(destinoRaiz, `backup-${id}`);
  await mkdir(diretorio, { mode: 0o700 });

  const composeBase = ['docker', 'compose', '--file', compose, '--project-name', projeto];
  try {
    await executarSemSaida([...composeBase, 'exec', '-T', 'storage', '/garage', 'meta', 'snapshot']);
    const artefatos = [];
    artefatos.push(await criarArtefatoComando({
      nome: 'postgresql', diretorio, chave,
      argumentos: [...composeBase, 'exec', '-T', 'postgres', 'pg_dump', '--username', 'vyntra_staging', '--dbname', 'vyntra_staging', '--format=custom', '--compress=9'],
    }));
    artefatos.push(await criarArtefatoComando({
      nome: 'midias-e-snapshot', diretorio, chave,
      argumentos: [...composeBase, '--profile', 'backup', 'run', '--rm', '--no-deps', 'backup_exportador', '-ec', 'tar -C /fontes -cf - storage-dados storage-snapshots'],
    }));
    artefatos.push(await criarArtefatoComando({
      nome: 'segredos', diretorio, chave,
      argumentos: ['tar', '-C', join(raiz, '.segredos', 'staging'), '-cf', '-', '.'],
    }));
    artefatos.push(await criarArtefatoComando({
      nome: 'configuracao', diretorio, chave,
      argumentos: ['tar', '-C', raiz, '-cf', '-', 'compose.staging.yaml', 'infra/staging'],
    }));

    const manifesto = {
      formato: 1,
      ambiente: 'staging',
      release,
      iniciado_em: inicio.toISOString(),
      concluido_em: new Date().toISOString(),
      artefatos,
    };
    const caminhoManifestoClaro = join(diretorio, '.manifesto-temporario.json');
    await writeFile(caminhoManifestoClaro, `${JSON.stringify(manifesto, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await criptografarFluxo({
      entrada: createReadStream(caminhoManifestoClaro),
      destino: join(diretorio, 'manifesto.json.vyntra'),
      chave,
    });
    await rm(caminhoManifestoClaro);
    await writeFile(join(diretorio, 'CATALOGO'), `VYNTRA_BACKUP=1\nAMBIENTE=staging\nINICIADO_EM=${manifesto.iniciado_em}\nRELEASE=${release}\n`, { mode: 0o600, flag: 'wx' });
    process.stdout.write(`${diretorio}\n`);
  } catch (erro) {
    await rm(diretorio, { recursive: true, force: true });
    throw erro;
  }
}

await principal();
