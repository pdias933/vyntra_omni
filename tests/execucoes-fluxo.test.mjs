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

test('identidade e seleção usam contexto explícito sem escolher vínculo implicitamente', async () => {
  const [executor, validador, servico, repositorio, modulo] = await Promise.all([
    ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
    ler('apps/api/src/fluxos/validador-publicacao-fluxo.ts'),
    ler('apps/api/src/contextos-cliente/servico-contextos-cliente.ts'),
    ler('apps/api/src/contextos-cliente/repositorio-contextos-cliente-prisma.ts'),
    ler('apps/api/src/execucoes-fluxo/modulo-execucoes-fluxo.ts'),
  ]);
  assert.match(executor, /ServicoContextosCliente/);
  assert.match(executor, /'IDENTIFICAR_CONTATO'/);
  assert.match(executor, /'SELECIONAR_CLIENTE'/);
  assert.match(executor, /'SELECIONAR_CONTRATO'/);
  assert.match(executor, /'SOLICITAR_DADOS_CONTATO'/);
  assert.match(validador, /variavel\?\.tipo !== 'UUID'/);
  assert.match(validador, /!variavel\.sensivel/);
  assert.match(servico, /obterContatoDoAtendimento/);
  assert.match(servico, /obterAlvoAutomatizavel/);
  assert.match(servico, /origem: 'FLUXO'/);
  assert.match(repositorio, /verificadoEm: \{ not: null \}/);
  assert.match(repositorio, /tipo: 'VERIFICADO'/);
  assert.match(repositorio, /tipo: 'MANUAL'/);
  assert.doesNotMatch(
    `${executor}\n${servico}\n${repositorio}`,
    /preferencial: true|nomeUsuario|telefoneE164|localizarClientes|AdaptadorErp|AdaptadorMk/,
  );
  assert.match(modulo, /ModuloContextosCliente/);
});

test('fatura usa contexto exato, consulta fora da transação e composição protegida', async () => {
  const [executor, servico, contexto, composicao, repositorio, modulo] =
    await Promise.all([
      ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
      ler('apps/api/src/execucoes-fluxo/servico-faturas-fluxo.ts'),
      ler('apps/api/src/execucoes-fluxo/contexto-fatura-execucao-fluxo.ts'),
      ler('apps/api/src/composicoes/segunda-via.ts'),
      ler(
        'apps/api/src/composicoes/repositorio-composicoes-segunda-via-prisma.ts',
      ),
      ler('apps/api/src/execucoes-fluxo/modulo-execucoes-fluxo.ts'),
    ]);
  assert.match(executor, /prepararNoFatura/);
  assert.match(executor, /this\.faturas\.executar/);
  assert.match(executor, /contextoPermaneceValido/);
  assert.match(executor, /ServicoMensagensSaida/);
  assert.doesNotMatch(executor, /AdaptadorErp|ServicoFinanceiroErp|Snapshot/);
  assert.match(servico, /ServicoFinanceiroErp/);
  assert.match(servico, /SELECAO_FATURA_NECESSARIA/);
  assert.match(servico, /ERP_INDISPONIVEL/);
  assert.match(servico, /@Optional\(\)/);
  assert.doesNotMatch(servico, /SNAPSHOT|MkSolutions|WSMK|https?:\/\//);
  assert.match(contexto, /faturaFluxo/);
  assert.match(composicao, /opcoesProtegidas/);
  assert.match(repositorio, /composicaoSegundaVia\.create/);
  assert.match(modulo, /ModuloComposicoes/);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP|AdaptadorErpSimulado/);
});

test('formulário usa cadastro interno, fallback seguro e submissão idempotente', async () => {
  const [executor, servico, repositorio, modulo, validador] =
    await Promise.all([
      ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
      ler('apps/api/src/formularios/servico-formularios.ts'),
      ler('apps/api/src/formularios/repositorio-formularios-prisma.ts'),
      ler('apps/api/src/formularios/modulo-formularios.ts'),
      ler('apps/api/src/fluxos/validador-publicacao-fluxo.ts'),
    ]);
  assert.match(executor, /ServicoFormularios/);
  assert.match(executor, /formularioAtivoNoAtendimento/);
  assert.match(executor, /resultado: 'FALLBACK'/);
  assert.match(executor, /ServicoMensagensSaida/);
  assert.doesNotMatch(executor, /AdaptadorMeta|flow_token|flow_id|response_json/);
  assert.match(servico, /bloquearSubmissao/);
  assert.match(servico, /IDEMPOTENCIA_SUBMISSAO_FORMULARIO_DIVERGENTE/);
  assert.match(servico, /SUBMISSAO_FORMULARIO_RECEBIDA/);
  assert.doesNotMatch(servico, /flow_token|response_json|https?:\/\//);
  assert.match(repositorio, /direcao: 'ENTRADA'/);
  assert.match(repositorio, /estado: 'ATIVO'/);
  assert.match(repositorio, /submissaoFormularioCanal\.create/);
  assert.match(modulo, /ServicoFormularios/);
  assert.doesNotMatch(modulo, /AdaptadorMeta|Simulado|CanalMensageria/);
  assert.match(validador, /CONFIGURACAO_FORMULARIO_INVALIDA/);
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

test('desbloqueio separa verificação de efeito e revalida autoridade automatizada', async () => {
  const [executor, fronteira, elegibilidade, execucao, repositorio, modulo] =
    await Promise.all([
      ler('apps/api/src/execucoes-fluxo/servico-executor-nos-fluxo.ts'),
      ler('apps/api/src/execucoes-fluxo/servico-desbloqueios-fluxo.ts'),
      ler(
        'apps/api/src/desbloqueios-confianca/servico-elegibilidade-desbloqueio-confianca.ts',
      ),
      ler(
        'apps/api/src/desbloqueios-confianca/servico-execucao-desbloqueio-confianca.ts',
      ),
      ler(
        'apps/api/src/desbloqueios-confianca/repositorio-desbloqueios-confianca-prisma.ts',
      ),
      ler('apps/api/src/execucoes-fluxo/modulo-execucoes-fluxo.ts'),
    ]);
  assert.match(executor, /prepararNoDesbloqueio/);
  assert.match(executor, /this\.desbloqueios\.executar/);
  assert.match(fronteira, /verificarParaFluxo/);
  assert.match(fronteira, /confirmacaoExplicita: true/);
  assert.match(fronteira, /uuidEstavel/);
  assert.match(elegibilidade, /contextoAtivoCorrespondeParaFluxo/);
  assert.match(execucao, /origem: 'FLUXO'/);
  assert.match(repositorio, /estado: 'AGUARDANDO'/);
  assert.match(repositorio, /modo: 'BOT'/);
  assert.match(repositorio, /filaAtualId: null/);
  assert.match(repositorio, /usuarioResponsavelId: null/);
  assert.match(repositorio, /verificadoEm: \{ not: null \}/);
  assert.match(modulo, /ModuloDesbloqueiosConfianca/);
  assert.doesNotMatch(modulo, /ADAPTADOR_ERP|AdaptadorErpSimulado/);
  assert.doesNotMatch(fronteira, /Snapshot|MkSolutions|WSMK|https?:\/\//);
});
