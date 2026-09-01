import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('histórico confirmado sustenta a política local e é imutável', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/prisma/migrations/20260901004000_historico_desbloqueio_confianca/migration.sql',
        raiz,
      ),
      'utf8',
    ),
  ]);
  assert.match(schema, /model RegistroDesbloqueioConfianca/);
  assert.match(schema, /operacaoRecuperavelId\s+String\s+@unique/);
  assert.match(migration, /registro_desbloqueio_contrato_confirmado_idx/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /ON DELETE RESTRICT/);
});

test('verificação exige tempo real, contexto exato e não executa desbloqueio', async () => {
  const [servico, porta, modulo] = await Promise.all([
    readFile(
      new URL(
        'apps/api/src/desbloqueios-confianca/servico-elegibilidade-desbloqueio-confianca.ts',
        raiz,
      ),
      'utf8',
    ),
    readFile(new URL('apps/api/src/erp/adaptador-erp.ts', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/src/desbloqueios-confianca/modulo-desbloqueios-confianca.ts',
        raiz,
      ),
      'utf8',
    ),
  ]);
  assert.match(porta, /verificarElegibilidadeDesbloqueio/);
  assert.match(servico, /VERIFICAR_DESBLOQUEIO_CONFIANCA/);
  assert.match(servico, /INTERVALO_TRINTA_DIAS_MS/);
  assert.match(servico, /TEMPO_REAL/);
  assert.doesNotMatch(servico, /SNAPSHOT|executarDesbloqueio/);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP|AdaptadorErpSimulado/);
});
