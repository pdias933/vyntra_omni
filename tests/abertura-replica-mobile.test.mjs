import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Exercita a abertura real do repositório, com contrato nativo controlado.
// Não equivale à homologação do SQLCipher em aparelho.
async function cenario(opcoes = {}) {
  const fonte = await readFile(new URL('../apps/mobile/src/offline/repositorio-replica-local.ts', import.meta.url), 'utf8');
  const compilado = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const chamadas = [];
  const responder = (sql) => {
    chamadas.push(sql);
    if (sql === 'PRAGMA cipher_version') return opcoes.semCifra ? [] : [{ cipher_version: '4.10.0 community' }];
    if (sql === 'PRAGMA cipher_use_hmac') return [{ cipher_use_hmac: opcoes.semHmac ? '0' : '1' }];
    if (sql === 'PRAGMA cipher_integrity_check') return opcoes.errosCifra ?? [];
    if (sql === 'PRAGMA integrity_check') {
      if (opcoes.chaveInvalida) throw new Error('ERRO_NATIVO_SINTETICO');
      return opcoes.integridade ?? [{ integrity_check: 'ok' }];
    }
    throw new Error('CONSULTA_TESTE_INESPERADA');
  };
  const banco = {
    execAsync: async (sql) => { chamadas.push(sql.startsWith('PRAGMA key') ? 'APLICOU_CHAVE' : sql); },
    getFirstAsync: async (sql) => responder(sql)[0] ?? null,
    getAllAsync: async (sql) => responder(sql),
    closeAsync: async () => { chamadas.push('FECHOU'); },
  };
  const modulo = { exports: {} };
  const carregar = (nome) => {
    if (nome === 'expo-sqlite') return { openDatabaseAsync: async () => banco };
    if (nome === './cofre-replica-local') return { CofreReplicaLocal: class { async obterOuCriarChaveBanco() { return 'a'.repeat(64); } } };
    throw new Error('IMPORTACAO_TESTE_INESPERADA');
  };
  new Function('require', 'module', 'exports', compilado)(carregar, modulo, modulo.exports);
  const repo = new modulo.exports.RepositorioReplicaLocal();
  repo.migrar = async () => {
    chamadas.push('MIGROU');
    if (opcoes.falhaMigration) throw new Error('MIGRATION_SINTETICA');
  };
  return { repo, chamadas };
}

test('SQLCipher íntegro retorna zero erros; aplica chave e valida antes da migration', async () => {
  const { repo, chamadas } = await cenario();
  await repo.abrir();
  assert.equal(chamadas[0], 'APLICOU_CHAVE');
  for (const pragma of ['PRAGMA cipher_version', 'PRAGMA cipher_use_hmac', 'PRAGMA cipher_integrity_check', 'PRAGMA integrity_check']) {
    assert.ok(chamadas.indexOf(pragma) < chamadas.indexOf('MIGROU'));
  }
  assert.ok(!chamadas.includes('FECHOU'));
});

for (const [nome, opcoes] of [
  ['SQLite sem cifra', { semCifra: true }],
  ['HMAC desabilitado', { semHmac: true }],
  ['erro criptográfico', { errosCifra: [{ erro: 'HMAC inválido' }] }],
  ['ok indevido no pragma criptográfico', { errosCifra: [{ resultado: 'ok' }] }],
  ['chave incorreta', { chaveInvalida: true }],
  ['integridade estrutural inválida', { integridade: [{ integrity_check: 'falha' }] }],
  ['verificação estrutural ausente', { integridade: [] }],
  ['resultado parcial misturado com erro', { integridade: [{ integrity_check: 'ok' }, { integrity_check: 'falha' }] }],
]) {
  test(`${nome}: fecha conexão e não migra nem libera réplica`, async () => {
    const { repo, chamadas } = await cenario(opcoes);
    await assert.rejects(repo.abrir());
    assert.equal(chamadas.at(-1), 'FECHOU');
    assert.ok(!chamadas.includes('MIGROU'));
    assert.equal(repo.banco, undefined);
  });
}

test('falha de migration fecha conexão sem apagar banco ou chave', async () => {
  const { repo, chamadas } = await cenario({ falhaMigration: true });
  await assert.rejects(repo.abrir());
  assert.equal(chamadas.at(-1), 'FECHOU');
  assert.equal(repo.banco, undefined);
});
