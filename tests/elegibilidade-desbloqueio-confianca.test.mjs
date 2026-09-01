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

test('execução reserva o contrato e confirma histórico, operação e auditoria atomicamente', async () => {
  const [schema, migration, servico, repositorio, modulo] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/prisma/migrations/20260901004500_reserva_desbloqueio_confianca/migration.sql',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        'apps/api/src/desbloqueios-confianca/servico-execucao-desbloqueio-confianca.ts',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        'apps/api/src/desbloqueios-confianca/repositorio-desbloqueios-confianca-prisma.ts',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        'apps/api/src/desbloqueios-confianca/modulo-desbloqueios-confianca.ts',
        raiz,
      ),
      'utf8',
    ),
  ]);
  assert.match(schema, /model ReservaDesbloqueioConfianca/);
  assert.match(migration, /PRIMARY KEY \("contrato_externo_id"\)/);
  assert.match(migration, /reserva_desbloqueio_operacao_key/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(servico, /confirmacaoExplicita !== true/);
  assert.match(servico, /EXECUTAR_DESBLOQUEIO_CONFIANCA/);
  assert.match(servico, /registrarResultadoIncerto/);
  assert.match(servico, /reconciliarDesbloqueioConfianca/);
  assert.match(servico, /this\.idempotencia\.concluir/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.doesNotMatch(servico, /SNAPSHOT/);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP|AdaptadorErpSimulado|Controller/);
});
