import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migracao = await readFile(
  'apps/api/prisma/migrations/20260831000300_criar_idempotencia_operacoes/migration.sql',
  'utf8',
);
const schema = await readFile('apps/api/prisma/schema.prisma', 'utf8');
const servico = await readFile(
  'apps/api/src/idempotencia/servico-idempotencia.ts',
  'utf8',
);

test('mantém chave idempotente única por tipo, escopo e hash', () => {
  assert.match(schema, /model RegistroIdempotencia/);
  assert.match(
    schema,
    /@@unique\(\[escopoTipo, escopoId, chaveHash\], map: "registro_idempotencia_escopo_chave_key"\)/,
  );
  assert.match(migracao, /registro_idempotencia_escopo_chave_key/);
  assert.match(migracao, /chave_hash_check/);
  assert.ok(!schema.includes('chaveIdempotencia'));
});

test('materializa operação recuperável, concessão e histórico de tentativas', () => {
  for (const estado of [
    'PENDENTE',
    'EM_EXECUCAO',
    'AGUARDANDO_NOVA_TENTATIVA',
    'RESULTADO_INCERTO',
    'EM_RECONCILIACAO',
    'CONCLUIDA',
    'FALHA_DEFINITIVA',
  ]) {
    assert.ok(migracao.includes(`'${estado}'`), estado);
  }
  assert.match(schema, /model OperacaoRecuperavel/);
  assert.match(schema, /model TentativaOperacao/);
  assert.match(migracao, /operacao_recuperavel_estado_check/);
  assert.match(migracao, /tentativa_operacao_numero_key/);
});

test('adquire concessão com concorrência otimista e nunca persiste token bruto', () => {
  assert.match(servico, /createMany\(\{/);
  assert.match(servico, /skipDuplicates: true/);
  assert.match(servico, /operacaoRecuperavel\.updateMany/);
  assert.match(servico, /versao: \{ increment: 1 \}/);
  assert.match(servico, /concessaoTokenHash: tokenHash/);
  assert.ok(!/concessaoTokenHash:\s*tokenConcessao/u.test(servico));
});

test('concessão expirada vira resultado incerto e exige reconciliação', () => {
  assert.match(servico, /recuperarConcessoesExpiradas/);
  assert.match(servico, /codigoUltimoErro: 'CONCESSAO_EXPIRADA'/);
  assert.match(servico, /estado: 'RESULTADO_INCERTO'/);
  assert.match(
    servico,
    /tipo === 'EXECUCAO'[\s\S]+\['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA'\][\s\S]+\['RESULTADO_INCERTO'\]/,
  );
});

test('migration é aditiva e protege coerência no PostgreSQL', () => {
  assert.ok(!/DROP (TABLE|COLUMN|TYPE)/u.test(migracao));
  assert.ok(!/ALTER TABLE[^;]+DROP/u.test(migracao));
  assert.match(migracao, /operacao_recuperavel_resultado_check/);
  assert.match(migracao, /tentativa_operacao_resultado_check/);
  assert.match(migracao, /ON DELETE RESTRICT/);
});
