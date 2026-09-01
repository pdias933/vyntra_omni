import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('ordem de serviço preserva criação única, versão e histórico imutável', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901005000_ordens_servico_erp/migration.sql',
    ),
  ]);

  assert.match(schema, /model OrdemServicoErp/);
  assert.match(schema, /operacaoCriacaoId\s+String\s+@unique/);
  assert.match(schema, /ordemServicoExternaId\s+String\s+@unique/);
  assert.match(schema, /model HistoricoAtualizacaoOrdemServicoErp/);
  assert.match(schema, /operacaoRecuperavelId\s+String\s+@unique/);
  assert.match(schema, /model ReservaAtualizacaoOrdemServicoErp/);
  assert.match(migration, /ordem_servico_erp_atualizacao_controlada/);
  assert.match(migration, /historico_atualizacao_ordem_servico_imutavel/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /reserva_atualizacao_ordem_operacao_key/);
  assert.match(migration, /ON DELETE RESTRICT/);
});

test('criação e atualização exigem contexto, protocolo, confirmação e reconciliação', async () => {
  const [servico, porta, repositorio] = await Promise.all([
    ler('apps/api/src/ordens-servico/servico-ordens-servico.ts'),
    ler('apps/api/src/erp/adaptador-erp.ts'),
    ler(
      'apps/api/src/ordens-servico/repositorio-ordens-servico-prisma.ts',
    ),
  ]);

  assert.match(servico, /confirmacaoExplicita !== true/);
  assert.match(servico, /CRIAR_ORDEM_SERVICO/);
  assert.match(servico, /contextoEProtocoloCorrespondem/);
  assert.match(servico, /this\.idempotencia\.concluir/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.match(servico, /reconciliarCriacaoOrdemServico/);
  assert.match(servico, /reconciliarAtualizacaoOrdemServico/);
  assert.doesNotMatch(servico, /SNAPSHOT/);
  assert.match(porta, /criarOrdemServico/);
  assert.match(porta, /atualizarOrdemServico/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(repositorio, /reservaAtualizacaoOrdemServicoErp/);
});

test('módulo interno não publica controller nem registra adapter real ou simulado', async () => {
  const [modulo, aplicacao] = await Promise.all([
    ler('apps/api/src/ordens-servico/modulo-ordens-servico.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
  ]);

  assert.match(aplicacao, /ModuloOrdensServico/);
  assert.doesNotMatch(
    modulo,
    /Controller|ADAPTADOR_ERP|AdaptadorErpSimulado|AdaptadorMkSolutions/,
  );
});
