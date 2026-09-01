import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('execução fixa atendimento, fluxo, versão e uma única autoridade ativa', async () => {
  const [schema, migration, repositorio] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901011000_execucoes_fluxo/migration.sql',
    ),
    ler(
      'apps/api/src/execucoes-fluxo/repositorio-execucoes-fluxo-prisma.ts',
    ),
  ]);
  assert.match(schema, /model ExecucaoFluxo/);
  assert.match(schema, /versaoFluxoId[\s\S]*VersaoFluxo/);
  assert.match(migration, /execucao_fluxo_ativa_atendimento_key/);
  assert.match(migration, /FOREIGN KEY \("versao_fluxo_id", "fluxo_id"\)/);
  assert.match(repositorio, /PROCESSANDO_BOT/);
  assert.match(repositorio, /versao_publicada_id/);
  assert.match(repositorio, /'PUBLICADA'::"estado_versao_fluxo"/);
  assert.match(repositorio, /ON CONFLICT DO NOTHING/);
});

test('máquina e PostgreSQL recusam retomada e mutação terminal', async () => {
  const [maquina, migration, modulo] = await Promise.all([
    ler(
      'apps/api/src/execucoes-fluxo/maquina-estado-execucao-fluxo.ts',
    ),
    ler(
      'apps/api/prisma/migrations/20260901011000_execucoes_fluxo/migration.sql',
    ),
    ler('apps/api/src/execucoes-fluxo/modulo-execucoes-fluxo.ts'),
  ]);
  assert.match(maquina, /ErroExecucaoFluxoTerminal/);
  assert.match(maquina, /SUSPENSA_POR_ATENDIMENTO_HUMANO/);
  assert.match(migration, /EXECUCAO_FLUXO_TERMINAL_IMUTAVEL/);
  assert.match(migration, /TRANSICAO_EXECUCAO_FLUXO_INVALIDA/);
  assert.match(modulo, /ServicoExecucoesFluxo/);
  assert.doesNotMatch(modulo, /Controller|Worker|BullMQ|Redis/);
});

test('serviço seleciona ponteiro somente no início e não audita contexto', async () => {
  const servico = await ler(
    'apps/api/src/execucoes-fluxo/servico-execucoes-fluxo.ts',
  );
  assert.match(servico, /obterVersaoPublicadaParaNovaExecucao/);
  assert.match(servico, /obterAtivaPorAtendimento/);
  assert.match(servico, /versaoFluxoId: versao\.id/);
  assert.doesNotMatch(servico, /dadosNovos:[\s\S]{0,300}contextoProtegido/);
});

test('agendamento é reconstruído do PostgreSQL sem depender do Redis', async () => {
  const [migration, repositorio, recuperacao, worker] = await Promise.all([
    ler(
      'apps/api/prisma/migrations/20260901011500_agendamento_execucoes_fluxo/migration.sql',
    ),
    ler(
      'apps/api/src/execucoes-fluxo/repositorio-execucoes-fluxo-prisma.ts',
    ),
    ler(
      'apps/api/src/execucoes-fluxo/servico-recuperacao-execucoes-fluxo.ts',
    ),
    ler('apps/api/src/worker-fluxos.ts'),
  ]);
  assert.match(migration, /execucao_fluxo_agendamento_check/);
  assert.match(migration, /RETOMADA_EXECUCAO_FLUXO_PREMATURA/);
  assert.match(repositorio, /FOR UPDATE SKIP LOCKED/);
  assert.match(repositorio, /"retomar_em" <=/);
  assert.match(recuperacao, /executarTransacao/);
  assert.match(recuperacao, /tipo: 'RETOMAR'/);
  assert.doesNotMatch(`${repositorio}\n${recuperacao}\n${worker}`, /Redis|BullMQ/);
});
