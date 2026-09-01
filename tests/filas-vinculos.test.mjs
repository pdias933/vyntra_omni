import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('administração de filas e vínculos usa permissão própria e auditoria transacional', async () => {
  const [servico, repositorio] = await Promise.all([
    readFile(new URL('apps/api/src/filas/servico-filas.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/filas/repositorio-filas-prisma.ts', raiz), 'utf8'),
  ]);
  assert.match(servico, /permissao: 'ADMINISTRAR_FILAS'/);
  assert.match(servico, /ACESSO_USUARIO_FILA_CONCEDIDO/);
  assert.match(servico, /ACESSO_USUARIO_FILA_REVOGADO/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.doesNotMatch(repositorio, /permissaoPerfil\.(create|update|upsert|delete)/);
});

test('vínculo é somente escopo e a permissão de ação continua no RBAC', async () => {
  const [autorizacao, fila] = await Promise.all([
    readFile(new URL('apps/api/src/autorizacao/servico-autorizacao.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/filas/modelo-fila.ts', raiz), 'utf8'),
  ]);
  assert.match(fila, /AcessoUsuarioFilaPersistido/);
  assert.match(autorizacao, /usuarioPodeExecutar\(contexto, entrada\.permissao\)/);
  assert.match(autorizacao, /contexto\.acessoFilaAtivo/);
  assert.ok(
    autorizacao.indexOf('usuarioPodeExecutar(contexto, entrada.permissao)') <
      autorizacao.indexOf('this.escopoFilaPermitido(contexto, entrada)'),
  );
});

test('módulo de filas não publica controller administrativo prematuro', async () => {
  const modulo = await readFile(
    new URL('apps/api/src/filas/modulo-filas.ts', raiz),
    'utf8',
  );
  assert.doesNotMatch(modulo, /controllers/);
});

