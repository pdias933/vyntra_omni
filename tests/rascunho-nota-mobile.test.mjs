import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

// Executa o SQL e os métodos reais. Não substitui a validação física do SQLCipher/cofre.
async function cenario() {
  const fonte = await readFile(new URL('../apps/mobile/src/offline/repositorio-replica-local.ts', import.meta.url), 'utf8');
  const compilado = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  const carregar = (nome) => {
    if (nome === 'expo-sqlite') return {};
    if (nome === './cofre-replica-local') return { CofreReplicaLocal: class {} };
    throw new Error('IMPORTACAO_TESTE_INESPERADA');
  };
  new Function('require', 'module', 'exports', compilado)(carregar, modulo, modulo.exports);
  const banco = new DatabaseSync(':memory:');
  const adapter = {
    execAsync: async (sql) => banco.exec(sql),
    getFirstAsync: async (sql, ...valores) => banco.prepare(sql).get(...valores) ?? null,
    runAsync: async (sql, ...valores) => banco.prepare(sql).run(...valores),
    withExclusiveTransactionAsync: async (executar) => {
      banco.exec('BEGIN');
      try { const retorno = await executar(adapter); banco.exec('COMMIT'); return retorno; }
      catch (erro) { banco.exec('ROLLBACK'); throw erro; }
    },
  };
  const repo = new modulo.exports.RepositorioReplicaLocal();
  repo.banco = Promise.resolve(adapter);
  await repo.migrar(adapter);
  const id = randomUUID(), conversa = randomUUID(), fila = randomUUID();
  banco.prepare('INSERT INTO fila VALUES (?, ?)').run(fila, 'Fila sintética');
  banco.prepare('INSERT INTO conversa VALUES (?, ?, ?, ?)').run(conversa, randomUUID(), new Date().toISOString(), 1);
  banco.prepare("INSERT INTO atendimento VALUES (?, ?, ?, 'EM_ATENDIMENTO', ?, 'HUMANO', 'NENHUM', ?, 1, 1, ?, 0)").run(id, conversa, randomUUID(), fila, randomUUID(), new Date().toISOString());
  banco.exec("INSERT INTO permissao VALUES ('ADICIONAR_NOTA_INTERNA'); INSERT INTO estado_replica VALUES (1, '1', 1, 'sintetico', '2099-01-01', 0)");
  return { banco, repo, adapter, id, conversa, fila };
}

test('migração v4→v5 é aditiva e não altera rascunho de mensagem', async () => {
  const x = await cenario();
  try {
    await x.repo.salvarRascunho(x.conversa, 'Mensagem ainda não enviada');
    x.banco.exec('DROP TABLE rascunho_nota; PRAGMA user_version = 4;');
    await x.repo.migrar(x.adapter);
    assert.equal(x.banco.prepare('PRAGMA user_version').get().user_version, 5);
    assert.equal(await x.repo.obterRascunho(x.conversa), 'Mensagem ainda não enviada');
    await x.repo.salvarRascunhoNota(x.id, 'Nota privada', randomUUID());
    const recibo = await x.repo.obterRascunhoNota(x.id);
    assert.equal(recibo.texto, 'Nota privada');
    assert.ok(recibo.chave);
    assert.equal(x.banco.prepare('SELECT count(*) AS n FROM pendencia_saida_texto').get().n, 0);
    await assert.rejects(x.repo.salvarRascunhoNota(x.id, 'a'.repeat(4001)));
  } finally { x.banco.close(); }
});

test('rascunho e recibo não sobrevivem a perda de fila/permissão ou logout', async () => {
  const x = await cenario();
  try {
    await x.repo.salvarRascunhoNota(x.id, 'Privada', randomUUID());
    const novaFila = randomUUID();
    x.banco.prepare('INSERT INTO fila VALUES (?, ?)').run(novaFila, 'Outra fila');
    x.banco.prepare('UPDATE atendimento SET fila_id = ? WHERE id = ?').run(novaFila, x.id);
    assert.equal((await x.repo.obterRascunhoNota(x.id)).texto, '');
    await x.repo.removerDadosPrivadosForaDoEscopo(x.adapter, { permissoes: ['ADICIONAR_NOTA_INTERNA', 'ENVIAR_MENSAGEM'] });
    assert.equal(x.banco.prepare('SELECT count(*) AS n FROM rascunho_nota').get().n, 0);
    x.banco.prepare('UPDATE atendimento SET fila_id = ? WHERE id = ?').run(x.fila, x.id);
    await x.repo.salvarRascunhoNota(x.id, 'Novo rascunho');
    x.banco.exec("DELETE FROM permissao WHERE codigo = 'ADICIONAR_NOTA_INTERNA'");
    assert.equal((await x.repo.obterRascunhoNota(x.id)).texto, '');
    await assert.rejects(x.repo.salvarRascunhoNota(x.id, 'Não restaurar'));
    await x.repo.removerDadosPrivadosForaDoEscopo(x.adapter, { permissoes: ['ENVIAR_MENSAGEM'] });
    assert.equal(x.banco.prepare('SELECT count(*) AS n FROM rascunho_nota').get().n, 0);
    await x.repo.limparReplicaAutenticada();
    assert.equal(x.banco.prepare('SELECT count(*) AS n FROM rascunho').get().n, 0);
  } finally { x.banco.close(); }
});
