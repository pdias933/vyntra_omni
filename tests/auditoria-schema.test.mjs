import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migracao = await readFile(
  'apps/api/prisma/migrations/20260831000100_criar_registro_auditoria/migration.sql',
  'utf8',
);
const schema = await readFile('apps/api/prisma/schema.prisma', 'utf8');
const repositorio = await readFile(
  'apps/api/src/auditoria/repositorio-auditoria-prisma.ts',
  'utf8',
);
const porta = await readFile(
  'apps/api/src/auditoria/repositorio-auditoria.ts',
  'utf8',
);

test('materializa todos os campos canônicos do RegistroAuditoria', () => {
  for (const campo of [
    'tipo_evento',
    'origem',
    'usuario_id',
    'fluxo_id',
    'versao_fluxo_id',
    'atendimento_id',
    'contato_id',
    'fila_id',
    'acao',
    'entidade_tipo',
    'entidade_id',
    'dados_anteriores_sanitizados',
    'dados_novos_sanitizados',
    'endereco_ip',
    'dispositivo_id',
    'sessao_id',
    'correlacao_id',
    'criado_em',
  ]) {
    assert.ok(migracao.includes(`"${campo}"`), campo);
  }

  assert.match(schema, /model RegistroAuditoria/);
  assert.match(schema, /enum OrigemAuditoria/);
  assert.match(migracao, /registro_auditoria_origem_ator_check/);
  assert.match(migracao, /registro_auditoria_entidade_check/);
});

test('bloqueia update, delete e truncate no PostgreSQL', () => {
  assert.match(
    migracao,
    /BEFORE UPDATE OR DELETE ON "registro_auditoria"/,
  );
  assert.match(migracao, /BEFORE TRUNCATE ON "registro_auditoria"/);
  assert.match(migracao, /REGISTRO_AUDITORIA_IMUTAVEL/);
  assert.match(
    migracao,
    /REVOKE UPDATE, DELETE, TRUNCATE ON "registro_auditoria" FROM PUBLIC/,
  );
  assert.ok(!/DROP (TABLE|COLUMN)/u.test(migracao));
});

test('expõe somente acrescentar no contrato e na implementação do repositório', () => {
  assert.match(porta, /acrescentar\([\s\S]+registro: RegistroAuditoria,[\s\S]+\): Promise<void>/);
  assert.ok(!porta.includes('atualizar'));
  assert.ok(!porta.includes('remover'));
  assert.match(repositorio, /registroAuditoria\.create/);
  assert.ok(!repositorio.includes('registroAuditoria.update'));
  assert.ok(!repositorio.includes('registroAuditoria.delete'));
});
