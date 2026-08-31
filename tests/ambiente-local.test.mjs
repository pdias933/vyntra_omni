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
  arquivosSegredos,
  endpointDockerEhLocal,
  prepararSegredos,
  validarSegredos,
} from '../scripts/ambiente-local.mjs';

const codigoAmbienteLocal = await readFile('scripts/ambiente-local.mjs', 'utf8');

test('gera segredos locais fortes sem sobrescrever material existente', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-segredos-'));

  t.after(async () => {
    await rm(diretorio, { force: true, recursive: true });
  });

  const criados = await prepararSegredos(diretorio);

  assert.deepEqual(
    [...criados].sort(),
    arquivosSegredos.map(({ nome }) => nome).sort(),
  );

  const resumosAntes = new Map();

  for (const definicao of arquivosSegredos) {
    const caminho = join(diretorio, definicao.nome);
    const conteudo = await readFile(caminho, 'utf8');
    const estado = await stat(caminho);

    assert.ok(definicao.validar(conteudo));
    assert.ok(conteudo.length >= 21);
    resumosAntes.set(
      definicao.nome,
      createHash('sha256').update(conteudo).digest('hex'),
    );

    if (process.platform !== 'win32') {
      assert.equal(estado.mode & 0o777, definicao.modo);
    }
  }

  assert.deepEqual(await prepararSegredos(diretorio), []);

  for (const definicao of arquivosSegredos) {
    const conteudo = await readFile(join(diretorio, definicao.nome), 'utf8');
    const resumo = createHash('sha256').update(conteudo).digest('hex');
    assert.equal(resumo, resumosAntes.get(definicao.nome));
  }

  await validarSegredos(diretorio);
});

test('recusa arquivo de segredo legível por outros usuários', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-permissoes-'));

  t.after(async () => {
    await rm(diretorio, { force: true, recursive: true });
  });

  await prepararSegredos(diretorio);

  if (process.platform === 'win32') {
    return;
  }

  const caminho = join(diretorio, 'senha-postgresql');
  await chmod(caminho, 0o644);

  await assert.rejects(
    validarSegredos(diretorio),
    /PERMISSAO_SEGREDO_INCORRETA:senha-postgresql/,
  );
});

test('recusa conjunto parcial para não trocar credencial de volume existente', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-parcial-'));

  t.after(async () => {
    await rm(diretorio, { force: true, recursive: true });
  });

  await prepararSegredos(diretorio);
  const caminhoAusente = join(diretorio, 'senha-postgresql');
  await rm(caminhoAusente);

  await assert.rejects(
    prepararSegredos(diretorio),
    /CONJUNTO_SEGREDOS_INCOMPLETO/,
  );
  await assert.rejects(readFile(caminhoAusente), { code: 'ENOENT' });
});

test('recusa diretório amplo ou simbólico para os segredos', async (t) => {
  if (process.platform === 'win32') {
    t.skip('permissões POSIX e symlink de diretório não são portáveis');
    return;
  }

  const raiz = await mkdtemp(join(tmpdir(), 'vyntra-diretorio-'));
  const diretorioReal = join(raiz, 'real');
  const diretorioSimbolico = join(raiz, 'simbolico');

  t.after(async () => {
    await rm(raiz, { force: true, recursive: true });
  });

  await mkdir(diretorioReal, { mode: 0o700 });
  await prepararSegredos(diretorioReal);
  await chmod(diretorioReal, 0o755);

  await assert.rejects(
    validarSegredos(diretorioReal),
    /PERMISSAO_DIRETORIO_SEGREDOS_INSEGURA/,
  );

  await symlink(diretorioReal, diretorioSimbolico, 'dir');
  await assert.rejects(
    prepararSegredos(diretorioSimbolico),
    /DIRETORIO_SEGREDOS_INVALIDO/,
  );
});

test('fixa arquivo, contexto e projeto local e preserva volumes ao parar', () => {
  assert.match(
    codigoAmbienteLocal,
    /'--context',\s*contexto,\s*'compose',\s*'--file',\s*caminhoCompose/,
  );
  assert.equal(endpointDockerEhLocal('unix:///var/run/docker.sock'), true);
  assert.equal(endpointDockerEhLocal('npipe:////./pipe/docker_engine'), true);
  assert.equal(endpointDockerEhLocal('ssh://root@servidor'), false);
  assert.equal(endpointDockerEhLocal('tcp://127.0.0.1:2375'), false);
  assert.match(codigoAmbienteLocal, /delete ambiente\[variavel\]/);
  assert.match(
    codigoAmbienteLocal,
    /codigoErro: 'DOCKER_COMPOSE_FALHOU'/,
  );
  assert.match(
    codigoAmbienteLocal,
    /case 'parar':[\s\S]*?executarDockerCompose\(\['down'\]\);/,
  );

  const blocoParar = codigoAmbienteLocal.match(
    /case 'parar':[\s\S]*?break;/,
  )?.[0];
  assert.ok(blocoParar);
  assert.ok(!blocoParar.includes('--volumes'));
});
