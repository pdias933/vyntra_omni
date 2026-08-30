import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { avaliarRelatorioAuditoria } from './auditoria-dependencias.mjs';

const raizRepositorio = join(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoConfiguracao = join(
  raizRepositorio,
  'configuracao',
  'excecoes-auditoria.json',
);
const caminhoLockfile = join(raizRepositorio, 'pnpm-lock.yaml');

function executarAuditoria() {
  const opcoes = {
    cwd: raizRepositorio,
    encoding: 'utf8',
    env: {
      ...process.env,
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    },
    maxBuffer: 50 * 1024 * 1024,
  };

  if (process.env.PNPM_EXECUTAVEL !== undefined) {
    return spawnSync(
      process.env.PNPM_EXECUTAVEL,
      ['audit', '--json'],
      opcoes,
    );
  }

  const executavelPnpm = process.env.npm_execpath;

  if (executavelPnpm === undefined) {
    throw new Error('PNPM_EXECUTAVEL_NAO_IDENTIFICADO');
  }

  if (/\.[cm]?js$/.test(executavelPnpm)) {
    return spawnSync(
      process.execPath,
      [executavelPnpm, 'audit', '--json'],
      opcoes,
    );
  }

  return spawnSync(executavelPnpm, ['audit', '--json'], opcoes);
}

async function verificarDependencias() {
  const configuracao = JSON.parse(
    await readFile(caminhoConfiguracao, 'utf8'),
  );
  const lockfile = parse(await readFile(caminhoLockfile, 'utf8'));

  for (const excecao of configuracao.excecoes ?? []) {
    await access(join(raizRepositorio, excecao.documento));
  }

  const resultado = executarAuditoria();

  if (resultado.error !== undefined) {
    throw resultado.error;
  }

  if (resultado.status !== 0 && resultado.status !== 1) {
    throw new Error('AUDITORIA_DEPENDENCIAS_INDISPONIVEL');
  }

  let relatorio;

  try {
    relatorio = JSON.parse(resultado.stdout);
  } catch {
    throw new Error('RELATORIO_AUDITORIA_INVALIDO');
  }

  const avaliacao = avaliarRelatorioAuditoria({
    configuracao,
    dataAtual: new Date().toISOString().slice(0, 10),
    lockfile,
    relatorio,
  });

  console.log(
    `Auditoria aprovada; exceções verificadas: ${avaliacao.avisosPermitidos.join(', ')}`,
  );
}

try {
  await verificarDependencias();
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : 'ERRO_DESCONHECIDO';
  console.error(`Auditoria de dependências bloqueada: ${mensagem}`);
  process.exitCode = 1;
}
