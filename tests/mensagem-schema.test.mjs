import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../apps/api/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../apps/api/prisma/migrations/20260901002500_criar_mensagem_maquina_saida/migration.sql', import.meta.url),
  'utf8',
);

test('mensagem preserva timeline por conversa, origem e idempotência do cliente', () => {
  assert.match(schema, /model Mensagem \{/u);
  assert.match(schema, /conversaId\s+String/u);
  assert.match(schema, /contaWhatsAppId\s+String/u);
  assert.match(schema, /mensagemClienteId\s+String\?/u);
  assert.match(migration, /mensagem_usuario_cliente_key/u);
  assert.match(migration, /mensagem_atendimento_conversa_fkey/u);
});

test('banco protege identidade e transições da máquina de saída', () => {
  assert.match(migration, /CREATE FUNCTION proteger_identidade_mensagem/u);
  assert.match(migration, /CREATE FUNCTION validar_transicao_estado_mensagem/u);
  assert.match(migration, /NA_FILA.*ENVIANDO.*CANCELADA/su);
  assert.match(migration, /ENVIANDO.*NA_FILA.*ENVIADA.*FALHOU/su);
  assert.match(migration, /ERRCODE = '23514'/u);
  assert.match(migration, /IDENTIDADE_MENSAGEM_IMUTAVEL/u);
});
