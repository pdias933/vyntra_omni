import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('fluxo e versões preservam ponteiro coerente e histórico imutável', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901010000_fluxos_versionados/migration.sql',
    ),
  ]);

  assert.match(schema, /model Fluxo/);
  assert.match(schema, /model VersaoFluxo/);
  assert.match(schema, /versaoPublicadaId\s+String\?/);
  assert.match(schema, /@@unique\(\[id, fluxoId\]/);
  assert.match(migration, /versao_fluxo_publicada_unica_por_fluxo_idx/);
  assert.match(migration, /fluxo_validar_ponteiro_publicado/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /versao_fluxo_proteger_historico/);
  assert.match(migration, /VERSAO_FLUXO_PUBLICADA_IMUTAVEL/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
});

test('catálogo exige RBAC, versão otimista e auditoria sem definição', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/fluxos/servico-catalogo-fluxos.ts'),
    ler('apps/api/src/fluxos/repositorio-fluxos-prisma.ts'),
  ]);

  assert.match(servico, /EDITAR_FLUXO/);
  assert.match(servico, /revisaoEsperada/);
  assert.match(servico, /estado !== 'RASCUNHO'/);
  assert.match(servico, /obterVersaoPublicadaParaNovaExecucao/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.doesNotMatch(servico, /dadosNovos[\s\S]{0,300}definicao[,\s]/);
  assert.match(repositorio, /estado: 'PUBLICADA'/);
  assert.match(repositorio, /versaoPublicadaId/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
});

test('módulo expõe o editor aprovado sem registrar executor ou adapter', async () => {
  const [modulo, aplicacao] = await Promise.all([
    ler('apps/api/src/fluxos/modulo-fluxos.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
  ]);

  assert.match(aplicacao, /ModuloFluxos/);
  assert.match(modulo, /ControladorEditorFluxos/);
  assert.doesNotMatch(modulo, /Worker|Executor|Adapter/);
});
