import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  arquivosSegredosBase,
  armazenarCredencialStorage,
  confirmacaoObrigatoria,
  endpointDockerEhLocal,
  obterEstadoCredencialStorage,
  prepararSegredosBase,
  validarCredencialStorage,
  validarSegredosBase,
} from '../scripts/ambiente-staging.mjs';

const codigoStaging = await readFile('scripts/ambiente-staging.mjs', 'utf8');

test('gera conjunto indivisível e forte para o staging isolado', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-staging-segredos-'));

  t.after(async () => {
    await rm(diretorio, { force: true, recursive: true });
  });

  const criados = await prepararSegredosBase(diretorio);
  assert.deepEqual(
    [...criados].sort(),
    arquivosSegredosBase.map(({ nome }) => nome).sort(),
  );

  const resumos = new Map();

  for (const definicao of arquivosSegredosBase) {
    const caminho = join(diretorio, definicao.nome);
    const conteudo = await readFile(caminho, 'utf8');
    const estado = await stat(caminho);

    assert.ok(definicao.validar(conteudo), definicao.nome);
    resumos.set(
      definicao.nome,
      createHash('sha256').update(conteudo).digest('hex'),
    );

    if (process.platform !== 'win32') {
      assert.equal(estado.mode & 0o777, definicao.modo, definicao.nome);
    }
  }

  const senhaPostgresql = (await readFile(
    join(diretorio, 'senha-postgresql'),
    'utf8',
  )).trim();
  const urlPostgresql = await readFile(join(diretorio, 'url-postgresql'), 'utf8');
  const aclRedis = await readFile(join(diretorio, 'redis.acl'), 'utf8');
  const urlRedis = await readFile(join(diretorio, 'url-redis'), 'utf8');
  const senhaRedis = aclRedis.match(/>([A-Za-z0-9_-]{43})/)?.[1];

  assert.ok(urlPostgresql.includes(`:${senhaPostgresql}@postgres:`));
  assert.ok(urlRedis.includes(`:${senhaRedis}@redis:`));
  assert.equal(await prepararSegredosBase(diretorio).then((itens) => itens.length), 0);

  for (const definicao of arquivosSegredosBase) {
    const conteudo = await readFile(join(diretorio, definicao.nome), 'utf8');
    assert.equal(
      createHash('sha256').update(conteudo).digest('hex'),
      resumos.get(definicao.nome),
    );
  }

  await validarSegredosBase(diretorio);
});

test('recusa segredo-base parcial ou com permissão ampliada', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-staging-parcial-'));
  const diretorioPermissoes = await mkdtemp(
    join(tmpdir(), 'vyntra-staging-permissoes-'),
  );

  t.after(async () => {
    await Promise.all(
      [diretorio, diretorioPermissoes].map((caminho) =>
        rm(caminho, { force: true, recursive: true }),
      ),
    );
  });

  await prepararSegredosBase(diretorio);
  await rm(join(diretorio, 'garage-admin'));
  await assert.rejects(
    prepararSegredosBase(diretorio),
    /CONJUNTO_SEGREDOS_STAGING_INCOMPLETO/,
  );

  await prepararSegredosBase(diretorioPermissoes);

  if (process.platform !== 'win32') {
    await chmod(join(diretorioPermissoes, 'garage-admin'), 0o644);
    await assert.rejects(
      validarSegredosBase(diretorioPermissoes),
      /PERMISSAO_SEGREDO_STAGING_INCORRETA:garage-admin/,
    );
  }
});

test('recusa diretório de staging amplo ou simbólico', async (t) => {
  if (process.platform === 'win32') {
    t.skip('permissões POSIX e symlink não são portáveis');
    return;
  }

  const raiz = await mkdtemp(join(tmpdir(), 'vyntra-staging-diretorio-'));
  const real = join(raiz, 'real');
  const simbolico = join(raiz, 'simbolico');

  t.after(async () => {
    await rm(raiz, { force: true, recursive: true });
  });

  await mkdir(real, { mode: 0o700 });
  await prepararSegredosBase(real);
  await chmod(real, 0o755);
  await assert.rejects(
    validarSegredosBase(real),
    /PERMISSAO_DIRETORIO_STAGING_INSEGURA/,
  );

  await chmod(real, 0o700);
  await symlink(real, simbolico, 'dir');
  await assert.rejects(
    prepararSegredosBase(simbolico),
    /DIRETORIO_SEGREDOS_STAGING_INVALIDO/,
  );
});

test('persiste a credencial do storage como par sem sobrescrever', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-staging-storage-'));

  t.after(async () => {
    await rm(diretorio, { force: true, recursive: true });
  });

  await prepararSegredosBase(diretorio);
  assert.equal(await obterEstadoCredencialStorage(diretorio), 'AUSENTE');

  const identificador = `GK${'a'.repeat(24)}`;
  const segredo = 'b'.repeat(64);
  assert.deepEqual(
    await armazenarCredencialStorage(identificador, segredo, diretorio),
    { identificador, segredo },
  );
  assert.equal(await obterEstadoCredencialStorage(diretorio), 'PRESENTE');
  assert.deepEqual(await validarCredencialStorage(diretorio), {
    identificador,
    segredo,
  });
  await assert.rejects(
    armazenarCredencialStorage(identificador, segredo, diretorio),
    /CREDENCIAL_STORAGE_STAGING_JA_EXISTE/,
  );

  await rm(join(diretorio, 'chave-storage-secreta'));
  await assert.rejects(
    obterEstadoCredencialStorage(diretorio),
    /CREDENCIAL_STORAGE_STAGING_INCOMPLETA/,
  );
});

test('fixa projeto, arquivo, contexto local e confirmação operacional', () => {
  assert.equal(endpointDockerEhLocal('unix:///var/run/docker.sock'), true);
  assert.equal(endpointDockerEhLocal('npipe:////./pipe/docker_engine'), true);
  assert.equal(endpointDockerEhLocal('ssh://root@servidor'), false);
  assert.equal(endpointDockerEhLocal('tcp://127.0.0.1:2375'), false);
  assert.equal(confirmacaoObrigatoria, 'STAGING_ISOLADO_SEM_DADOS_DE_PRODUCAO');
  assert.match(codigoStaging, /const nomeProjeto = 'vyntra-staging'/);
  assert.match(codigoStaging, /const caminhoCompose = join\([\s\S]*?'compose\.staging\.yaml'/);
  assert.match(codigoStaging, /CONTEXTO_DOCKER_REMOTO_BLOQUEADO_PARA_STAGING/);
  assert.match(codigoStaging, /delete ambiente\[variavel\]/);

  const blocoParar = codigoStaging.match(/case 'parar':[\s\S]*?break;/)?.[0];
  assert.ok(blocoParar);
  assert.ok(!blocoParar.includes('--volumes'));
});
