import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('snapshot e sequência base usam a mesma leitura consistente e somente leitura', async () => {
  const [prisma, repositorio] = await Promise.all([
    ler('apps/api/src/persistencia/servico-prisma.ts'),
    ler('apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts'),
  ]);
  assert.match(prisma, /TransactionIsolationLevel\.RepeatableRead/);
  assert.match(prisma, /SET TRANSACTION READ ONLY/);
  assert.match(repositorio, /executarLeituraConsistente/);
  assert.ok(
    repositorio.indexOf('max("sequencia_evento")') <
      repositorio.indexOf('usuario.findUnique'),
  );
});

test('recursos do snapshot são filtrados no PostgreSQL pela autorização vigente', async () => {
  const repositorio = await ler(
    'apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts',
  );
  assert.match(repositorio, /filas_autorizadas AS/);
  assert.match(repositorio, /acesso_usuario_fila/);
  assert.match(repositorio, /pode_visualizar_fila/);
  assert.match(repositorio, /pode_visualizar_nota/);
  assert.match(repositorio, /JOIN conversas_autorizadas/);
  assert.match(repositorio, /posicao<=200/);
});

test('contrato publica sequência base e aplicação local atômica', async () => {
  const [controlador, planejador] = await Promise.all([
    ler('apps/api/src/sincronizacao/controlador-sincronizacao.ts'),
    ler('apps/api/src/sincronizacao/planejador-aplicacao-snapshot.ts'),
  ]);
  assert.match(controlador, /@Get\('completa'\)/);
  assert.match(controlador, /SnapshotSincronizacaoDto/);
  assert.match(planejador, /SUBSTITUIR_REPLICA_AUTORIZADA/);
  assert.match(planejador, /PERSISTIR_SEQUENCIA_BASE/);
  assert.ok(!/Redis|Promise\.all/u.test(planejador));
});
