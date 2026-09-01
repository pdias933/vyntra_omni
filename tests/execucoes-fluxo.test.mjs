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

test('espera por resposta e calendário preservam autoridade no domínio', async () => {
  const [migration, contexto, executor, execucoes, repositorio, modulo] =
    await Promise.all([
      ler(
        'apps/api/prisma/migrations/20260901012500_espera_resposta_fluxo/migration.sql',
      ),
      ler(
        'apps/api/src/execucoes-fluxo/contexto-espera-execucao-fluxo.ts',
      ),
      ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
      ler('apps/api/src/execucoes-fluxo/servico-execucoes-fluxo.ts'),
      ler(
        'apps/api/src/execucoes-fluxo/repositorio-execucoes-fluxo-prisma.ts',
      ),
      ler('apps/api/src/execucoes-fluxo/modulo-execucoes-fluxo.ts'),
    ]);
  assert.match(migration, /AGUARDANDO_RESPOSTA/);
  assert.match(migration, /respostaRecebida/);
  assert.match(migration, /RETOMADA_EXECUCAO_FLUXO_PREMATURA/);
  assert.match(contexto, /esperasFluxo/);
  assert.match(contexto, /marcarRespostaRecebidaFluxo/);
  assert.match(executor, /'AGUARDAR'/);
  assert.match(executor, /'HORARIO_ATENDIMENTO'/);
  assert.match(executor, /ServicoCalendarios/);
  assert.match(execucoes, /retomarPorResposta/);
  assert.match(repositorio, /AGUARDANDO_RESPOSTA/);
  assert.match(modulo, /ModuloCalendarios/);
  assert.doesNotMatch(
    `${contexto}\n${executor}\n${execucoes}\n${repositorio}`,
    /setTimeout|Redis|BullMQ|AdaptadorMeta|AdaptadorMk/,
  );
});

test('nós de mensagem usam domínio, passos sanitizados e saídas nominais', async () => {
  const [schema, migration, executor, mensagens, repositorioMensagens, processo] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901012000_nos_mensagem_lista/migration.sql',
    ),
    ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
    ler('apps/api/src/mensagens/servico-mensagens-saida.ts'),
    ler('apps/api/src/mensagens/repositorio-mensagens-prisma.ts'),
    ler(
      'apps/api/src/execucoes-fluxo/processo-recuperacao-execucoes-fluxo.ts',
    ),
  ]);
  assert.match(schema, /model PassoExecucaoFluxo/);
  assert.match(schema, /revisaoExecucao/);
  assert.match(migration, /passo_execucao_fluxo_revisao_key/);
  assert.match(migration, /PASSO_EXECUCAO_FLUXO_TERMINAL_IMUTAVEL/);
  assert.match(executor, /obterVersaoFixaExecucao/);
  assert.match(executor, /ServicoMensagensSaida/);
  assert.match(executor, /FALHA_TEMPORARIA/);
  assert.match(executor, /FALHA_DEFINITIVA/);
  assert.match(executor, /entradaSanitizada: \{ tipoNo: no\.tipo \}/);
  assert.doesNotMatch(executor, /meta-cloud|Adaptador|CanalMensageria|conteudoProtegido/);
  assert.match(repositorioMensagens, /PROCESSANDO_BOT/);
  assert.match(mensagens, /MENSAGEM_AUTOMATICA_CRIADA/);
  assert.match(mensagens, /destino: 'MENSAGERIA'/);
  assert.match(processo, /executor\.executarCiclo/);
  assert.doesNotMatch(`${executor}\n${processo}`, /Redis|BullMQ/);
});

test('condições e variáveis são tipadas, limitadas e ficam fora do diagnóstico', async () => {
  const [valores, contexto, executor, validador, execucoes] = await Promise.all([
    ler('apps/api/src/fluxos/valor-variavel-fluxo.ts'),
    ler(
      'apps/api/src/execucoes-fluxo/contexto-variaveis-execucao-fluxo.ts',
    ),
    ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
    ler('apps/api/src/fluxos/validador-publicacao-fluxo.ts'),
    ler('apps/api/src/execucoes-fluxo/servico-execucoes-fluxo.ts'),
  ]);
  assert.match(valores, /BOOLEANO:[\s\S]*DATA_HORA:[\s\S]*DECIMAL:/);
  assert.match(valores, /decimalEscalado/);
  assert.match(valores, /avaliarCondicaoTipada/);
  assert.match(contexto, /variaveisFluxo/);
  assert.match(contexto, /iteracoesFluxo/);
  assert.match(executor, /'CONDICAO'/);
  assert.match(executor, /'DEFINIR_VARIAVEL'/);
  assert.match(executor, /VARIAVEL_INDISPONIVEL/);
  assert.match(executor, /LIMITE_ITERACOES_EXCEDIDO/);
  assert.match(validador, /LIMITE_ITERACOES_SEM_SAIDA/);
  assert.match(validador, /temCicloNoSubgrafo/);
  assert.doesNotMatch(execucoes, /dadosNovos:[\s\S]{0,400}contextoProtegido/);
  assert.doesNotMatch(
    `${valores}\n${contexto}\n${executor}`,
    /\beval\s*\(|new Function|child_process|\bsql\b|https?:\/\//,
  );
});
