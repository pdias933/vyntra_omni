import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('mudança de escopo versiona usuário e confirma evento na mesma transação', async () => {
  const [schema, migration, servico, filas] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901003400_versionar_permissoes_usuario/migration.sql',
    ),
    ler('apps/api/src/autorizacao/servico-invalidacao-permissoes.ts'),
    ler('apps/api/src/filas/servico-filas.ts'),
  ]);
  assert.match(schema, /versaoPermissoes\s+Int\s+@default\(1\)/);
  assert.match(migration, /ADD COLUMN "versao_permissoes" INTEGER NOT NULL DEFAULT 1/);
  assert.match(servico, /incrementarVersao/);
  assert.match(servico, /PERMISSOES_ALTERADAS/);
  assert.match(servico, /eventos\.acrescentar/);
  assert.match(filas, /ACESSO_FILA_CONCEDIDO/);
  assert.match(filas, /ACESSO_FILA_REVOGADO/);
  assert.match(filas, /FILA_INATIVADA/);
});

test('SSE e WebSocket entregam a invalidação e encerram a conexão', async () => {
  const [sse, websocket] = await Promise.all([
    ler('apps/api/src/sincronizacao/coordenador-sse-sem-lacuna.ts'),
    ler('apps/api/src/sincronizacao/gateway-eventos-mobile.ts'),
  ]);
  assert.match(sse, /evento\.tipo === 'PERMISSOES_ALTERADAS'/);
  assert.match(sse, /destino\.invalidarEscopo/);
  assert.match(sse, /validarAutoridade/);
  assert.match(websocket, /evento\.tipo === 'PERMISSOES_ALTERADAS'/);
  assert.match(websocket, /close\(4003, 'ESCOPO_ALTERADO'\)/);
  assert.match(websocket, /await this\.autenticacao\.autenticar/);
});

test('snapshot autorizado carrega a versão e o mobile substitui a réplica removendo ausentes', async () => {
  const [repositorio, dto, coordenador] = await Promise.all([
    ler('apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts'),
    ler('apps/api/src/sincronizacao/dto/sincronizacao.dto.ts'),
    ler('apps/mobile/src/sincronizacao/coordenador-invalidacao-escopo.ts'),
  ]);
  assert.match(repositorio, /versaoPermissoes/);
  assert.match(dto, /versao_permissoes/);
  const execucao = coordenador.slice(coordenador.indexOf('private async executar'));
  assert.ok(
    execucao.indexOf('pausarComandosDependentes') <
      execucao.indexOf('obterSnapshotAutorizado'),
  );
  assert.ok(
    execucao.indexOf('obterSnapshotAutorizado') <
      execucao.indexOf('substituirReplicaRemovendoAusentes'),
  );
  assert.ok(
    execucao.indexOf('substituirReplicaRemovendoAusentes') <
      execucao.indexOf('abrirTempoReal'),
  );
  assert.match(coordenador, /bloquearAreaAutenticada/);
  assert.ok(!/push|Redis/iu.test(coordenador));
});
