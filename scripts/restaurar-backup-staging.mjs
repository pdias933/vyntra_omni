import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  descriptografarArquivo,
  lerChaveBackup,
  sha256Arquivo,
} from './lib/backup-criptografia.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imagemPostgres = 'docker.io/library/postgres:18.6-alpine3.23@sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f';

function exigir(nome) {
  const valor = process.env[nome];
  if (typeof valor !== 'string' || valor.length === 0) throw new Error(`${nome}_AUSENTE`);
  return valor;
}

async function exigirAlvoLimpo(caminho) {
  if (!isAbsolute(caminho) || caminho.startsWith(`${raiz}/`) || caminho === raiz) {
    throw new Error('ALVO_RESTAURACAO_INVALIDO');
  }
  await mkdir(caminho, { recursive: false, mode: 0o700 });
  const estado = await lstat(caminho);
  if (!estado.isDirectory() || estado.isSymbolicLink() || (await readdir(caminho)).length !== 0) {
    throw new Error('ALVO_RESTAURACAO_NAO_ESTA_LIMPO');
  }
}

function docker(argumentos, opcoes = {}) {
  const resultado = spawnSync('docker', argumentos, { encoding: 'utf8', ...opcoes });
  if (resultado.status !== 0) throw new Error(`RESTAURACAO_DOCKER_FALHOU:${argumentos[0]}`);
  return resultado.stdout.trim();
}

function aguardarPostgresql(nome) {
  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    const resultado = spawnSync('docker', ['exec', nome, 'pg_isready', '--quiet', '--username', 'postgres', '--dbname', 'restauracao']);
    if (resultado.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('POSTGRESQL_RESTAURACAO_NAO_FICOU_PRONTO');
}

function restaurarEValidarPostgresql(caminho) {
  const nome = `vyntra-restauracao-${randomBytes(6).toString('hex')}`;
  docker(['run', '--detach', '--name', nome, '--network', 'none', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=restauracao', imagemPostgres]);
  try {
    aguardarPostgresql(nome);
    docker(['cp', caminho, `${nome}:/tmp/postgresql.dump`]);
    docker(['exec', nome, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--username', 'postgres', '--dbname', 'restauracao', '/tmp/postgresql.dump']);
    const migracoes = docker(['exec', nome, 'psql', '--tuples-only', '--no-align', '--username', 'postgres', '--dbname', 'restauracao', '--command', "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"]);
    if (!/^[1-9][0-9]*$/u.test(migracoes)) throw new Error('MIGRACOES_RESTAURADAS_INVALIDAS');
  } finally {
    spawnSync('docker', ['rm', '--force', nome], { stdio: 'ignore' });
  }
}

async function principal() {
  const inicio = performance.now();
  const backup = resolve(exigir('VYNTRA_BACKUP_ORIGEM'));
  const alvo = exigir('VYNTRA_RESTAURACAO_ALVO');
  if (exigir('VYNTRA_CONFIRMAR_RESTAURACAO') !== `RESTAURAR_EM_AMBIENTE_LIMPO_${alvo}`) {
    throw new Error('CONFIRMACAO_RESTAURACAO_INVALIDA');
  }
  await exigirAlvoLimpo(alvo);
  const chave = await lerChaveBackup(exigir('VYNTRA_BACKUP_CHAVE_FILE'));
  try {
    const manifestoClaro = join(alvo, 'manifesto.json');
    await descriptografarArquivo({ origem: join(backup, 'manifesto.json.vyntra'), destino: manifestoClaro, chave });
    const manifesto = JSON.parse(await readFile(manifestoClaro, 'utf8'));
    if (manifesto.formato !== 1 || manifesto.ambiente !== 'staging' || !Array.isArray(manifesto.artefatos)) {
      throw new Error('MANIFESTO_BACKUP_INVALIDO');
    }
    for (const artefato of manifesto.artefatos) {
      if (!/^[a-z0-9-]+\.vyntra$/u.test(artefato.arquivo)) throw new Error('ARTEFATO_BACKUP_INVALIDO');
      const origem = join(backup, artefato.arquivo);
      if (await sha256Arquivo(origem) !== artefato.sha256_cifrado) throw new Error('HASH_BACKUP_DIVERGENTE');
      await descriptografarArquivo({ origem, destino: join(alvo, artefato.arquivo.replace(/\.vyntra$/u, artefato.arquivo === 'postgresql.vyntra' ? '.dump' : '.tar')), chave });
    }
    restaurarEValidarPostgresql(join(alvo, 'postgresql.dump'));
    const rtoSegundos = Math.ceil((performance.now() - inicio) / 1000);
    const evidencia = createHash('sha256').update(`${manifesto.iniciado_em}|${manifesto.release}|${rtoSegundos}`).digest('hex');
    process.stdout.write(`${JSON.stringify({ estado: 'RESTAURACAO_VALIDADA', release: manifesto.release, rto_segundos: rtoSegundos, evidencia }, null, 2)}\n`);
  } catch (erro) {
    await rm(alvo, { recursive: true, force: true });
    throw erro;
  }
}

await principal();
