import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('histórico de publicação é acrescentado, coerente e imutável', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901010500_historico_publicacao_fluxo/migration.sql',
    ),
  ]);
  assert.match(schema, /model HistoricoPublicacaoFluxo/);
  assert.match(schema, /TipoMudancaPublicacaoFluxo/);
  assert.match(schema, /@@unique\(\[fluxoId, revisaoFluxoResultante\]/);
  assert.match(migration, /historico_publicacao_fluxo_tipo_check/);
  assert.match(migration, /historico_publicacao_fluxo_validar_versoes/);
  assert.match(migration, /HISTORICO_PUBLICACAO_FLUXO_IMUTAVEL/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /BEFORE TRUNCATE/);
});

test('publicação, arquivo e reversão usam RBAC, lock, revisão e uma transação externa', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/fluxos/servico-publicacao-fluxos.ts'),
    ler('apps/api/src/fluxos/repositorio-fluxos-prisma.ts'),
  ]);
  assert.match(servico, /PUBLICAR_FLUXO/);
  assert.match(servico, /REVERTER_FLUXO/);
  assert.match(servico, /bloquearFluxo/);
  assert.match(servico, /revisaoFluxoEsperada/);
  assert.match(servico, /arquivarVersao/);
  assert.match(servico, /reativarVersaoArquivada/);
  assert.match(servico, /registrarHistoricoPublicacao/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.doesNotMatch(servico, /\$transaction|definicao:/);
  assert.match(repositorio, /versaoPublicadaId: versaoNovaId \?\? null/);
  assert.match(repositorio, /historicoPublicacaoFluxo\.create/);
});

test('módulo continua interno sem rota de publicação antes do validador completo', async () => {
  const modulo = await ler('apps/api/src/fluxos/modulo-fluxos.ts');
  assert.match(modulo, /ServicoPublicacaoFluxos/);
  assert.doesNotMatch(modulo, /Controller/);
});
