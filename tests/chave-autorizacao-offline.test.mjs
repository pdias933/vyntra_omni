import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  modoArquivoChaveAutorizacaoOffline,
  nomeArquivoChaveAutorizacaoOffline,
  obterConfiguracaoPublicaMobile,
  prepararChaveAutorizacaoOffline,
  validarChaveAutorizacaoOffline,
} from '../scripts/chave-autorizacao-offline.mjs';

test('gera Ed25519 uma única vez e expõe somente a chave pública mobile', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-chave-offline-'));
  t.after(() => rm(diretorio, { force: true, recursive: true }));

  assert.equal(await prepararChaveAutorizacaoOffline(diretorio), true);
  const caminho = join(diretorio, nomeArquivoChaveAutorizacaoOffline);
  const privadaAntes = await readFile(caminho, 'utf8');
  const estado = await stat(caminho);
  assert.match(privadaAntes, /^-----BEGIN PRIVATE KEY-----/u);
  if (process.platform !== 'win32') {
    assert.equal(estado.mode & 0o777, modoArquivoChaveAutorizacaoOffline);
  }

  assert.equal(await prepararChaveAutorizacaoOffline(diretorio), false);
  assert.equal(await readFile(caminho, 'utf8'), privadaAntes);
  const publica = JSON.parse(
    await obterConfiguracaoPublicaMobile(diretorio, 'staging-2026-09'),
  );
  assert.deepEqual(Object.keys(publica), ['staging-2026-09']);
  assert.match(publica['staging-2026-09'], /^[A-Za-z0-9_-]{43}$/u);
  assert.ok(!JSON.stringify(publica).includes('PRIVATE'));
});

test('recusa chave adulterada, identificador inválido e permissão ampla', async (t) => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-chave-offline-'));
  t.after(() => rm(diretorio, { force: true, recursive: true }));
  await prepararChaveAutorizacaoOffline(diretorio);

  await assert.rejects(
    obterConfiguracaoPublicaMobile(diretorio, '../invalido'),
    /IDENTIFICADOR_CHAVE_AUTORIZACAO_OFFLINE_INVALIDO/u,
  );
  if (process.platform !== 'win32') {
    const caminho = join(diretorio, nomeArquivoChaveAutorizacaoOffline);
    await chmod(caminho, 0o644);
    await assert.rejects(
      validarChaveAutorizacaoOffline(diretorio),
      /PERMISSAO_CHAVE_AUTORIZACAO_OFFLINE_INCORRETA/u,
    );
  }
});
