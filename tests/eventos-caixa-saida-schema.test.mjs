import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migracao = await readFile(
  'apps/api/prisma/migrations/20260831000200_criar_eventos_caixa_saida/migration.sql',
  'utf8',
);
const schema = await readFile('apps/api/prisma/schema.prisma', 'utf8');
const unidadeTrabalho = await readFile(
  'apps/api/src/eventos/servico-transacao-dominio.ts',
  'utf8',
);
const repositorioEvento = await readFile(
  'apps/api/src/eventos/repositorio-evento-dominio-prisma.ts',
  'utf8',
);
const repositorioCaixa = await readFile(
  'apps/api/src/eventos/repositorio-caixa-saida-prisma.ts',
  'utf8',
);

test('materializa EventoDominio com sequência global atribuída pelo servidor', () => {
  for (const campo of [
    'sequencia_evento',
    'tipo',
    'entidade_tipo',
    'entidade_id',
    'atendimento_id',
    'conversa_id',
    'usuario_ator_id',
    'classificacao_dados',
    'dados_protegidos_minimizados',
    'criado_em',
  ]) {
    assert.ok(migracao.includes(`"${campo}"`), campo);
  }

  assert.match(schema, /model EventoDominio/);
  assert.match(schema, /sequenciaEvento\s+BigInt\s+@unique @default\(autoincrement\(\)\)/);
  assert.match(migracao, /"sequencia_evento" BIGSERIAL NOT NULL/);
  assert.match(migracao, /evento_dominio_sequencia_evento_key/);
});

test('vincula cada item da caixa de saída a um evento confirmado', () => {
  assert.match(schema, /model ItemCaixaSaida/);
  assert.match(migracao, /FOREIGN KEY \("evento_dominio_id"\) REFERENCES "evento_dominio"\("id"\)/);
  assert.match(migracao, /ON DELETE RESTRICT/);
  assert.match(migracao, /item_caixa_saida_estado_check/);
  assert.match(migracao, /item_caixa_saida_pendente_idx/);
});

test('a unidade de trabalho grava alteração, evento e itens dentro de uma única transação', () => {
  assert.equal(
    unidadeTrabalho.match(/executarTransacao/g)?.length,
    1,
  );
  assert.match(unidadeTrabalho, /await entrada\.alterar\(transacao\)/);
  assert.match(unidadeTrabalho, /eventos\.acrescentar/);
  assert.match(unidadeTrabalho, /caixaSaida\.acrescentar/);
  assert.ok(!unidadeTrabalho.includes('Promise.all'));
  assert.match(repositorioEvento, /eventoDominio\.create/);
  assert.match(repositorioCaixa, /itemCaixaSaida\.create/);
  assert.ok(!repositorioEvento.includes('eventoDominio.update'));
  assert.ok(!repositorioCaixa.includes('itemCaixaSaida.upsert'));
});

test('a migration é apenas aditiva', () => {
  assert.ok(!/DROP (TABLE|COLUMN|TYPE)/u.test(migracao));
  assert.ok(!/ALTER TABLE[^;]+DROP/u.test(migracao));
});
