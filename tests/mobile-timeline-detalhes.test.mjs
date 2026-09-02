import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('rotas mobile revalidam sessão e recurso antes de timeline, leitura e contexto', async () => {
  const [controlador, autenticacao] = await Promise.all([
    ler('apps/api/src/console-mobile/controlador-console-mobile.ts'),
    ler('apps/api/src/autenticacao/servico-autenticacao-mobile.ts'),
  ]);
  assert.match(controlador, /@ApiBearerAuth\('sessaoMobile'\)/u);
  assert.match(controlador, /NOME_HEADER_DISPOSITIVO_MOBILE/u);
  assert.match(controlador, /NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE/u);
  assert.match(controlador, /this\.autenticacao\.executarComSessaoAtual/u);
  assert.match(controlador, /this\.timeline\.marcarLida/u);
  assert.match(controlador, /this\.contato\.alterarContexto/u);
  assert.match(controlador, /const sessao = await this\.autenticar\(autorizacao, dispositivoId, segredo\)/u);
  assert.match(autenticacao, /public async executarComSessaoAtual/u);
});

test('cliente mobile usa somente SDK gerado, contratos fechados e uma renovação após 401', async () => {
  const [adaptador, modelo, servico] = await Promise.all([
    ler('apps/mobile/src/atendimentos/adaptador-atendimentos-http.ts'),
    ler('apps/mobile/src/atendimentos/modelo-atendimento-mobile.ts'),
    ler('apps/mobile/src/atendimentos/servico-atendimentos-mobile.ts'),
  ]);
  for (const operacao of [
    'obterTimelineMobile',
    'obterDetalhesContatoMobile',
    'consultarFinanceiroContatoMobile',
    'confirmarLeituraTimelineMobile',
    'alterarContextoContatoMobile',
  ]) {
    assert.match(adaptador, new RegExp(operacao));
  }
  assert.doesNotMatch(adaptador, /fetch\(/u);
  assert.match(modelo, /chavesExatas/u);
  assert.match(modelo, /CONTRATO_ATENDIMENTO_MOBILE_INVALIDO/u);
  assert.match(servico, /erro\.statusHttp !== 401/u);
  assert.match(servico, /obterCredenciaisSincronizacao\(true\)/u);
});

test('timeline local pagina o snapshot autorizado por conversa sem inventar eventos', async () => {
  const repositorio = await ler(
    'apps/mobile/src/offline/repositorio-replica-local.ts',
  );
  const trecho = repositorio.slice(
    repositorio.indexOf('public async listarTimeline'),
    repositorio.indexOf('public async confirmarLeituraLocal'),
  );
  assert.match(trecho, /WHERE m\.conversa_id = \?/u);
  assert.match(trecho, /WHERE conversa_id = \?/u);
  assert.match(trecho, /LIMIT 200/u);
  assert.match(trecho, /m\.tipo <> 'REACAO'/u);
  assert.doesNotMatch(trecho, /EVENTO_OPERACIONAL/u);
});

test('lista abre conversa e detalhes em pilha preservando a tela e seu estado', async () => {
  const [navegacao, lista] = await Promise.all([
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
    ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx'),
  ]);
  assert.match(navegacao, /createNativeStackNavigator<RotasAtendimentos>/u);
  assert.match(navegacao, /name="Conversa"/u);
  assert.match(navegacao, /name="Detalhes"/u);
  assert.match(navegacao, /navigation\.navigate\('Detalhes'/u);
  assert.match(navegacao, /navigation\.goBack\(\)/u);
  assert.match(lista, /accessibilityHint="Abre a conversa"/u);
});

test('conversa diferencia mensagens, notas, eventos, formulários e origem', async () => {
  const [tela, timeline, projetor] = await Promise.all([
    ler('apps/mobile/src/telas/TelaConversaMobile.tsx'),
    ler('apps/api/src/console-web/servico-timeline-web.ts'),
    ler('apps/api/src/formularios/projetor-submissao-formulario.ts'),
  ]);
  assert.match(tela, /Somente equipe/u);
  assert.match(tela, /Informações recebidas/u);
  assert.match(tela, /Ver formulário/u);
  assert.match(tela, /contaWhatsAppNome/u);
  assert.match(tela, /estadoMensagem/u);
  assert.match(tela, /maintainVisibleContentPosition/u);
  assert.match(tela, /scrollToEnd/u);
  assert.match(tela, /tempoRestanteJanela/u);
  assert.match(tela, /Dados sensíveis são mascarados conforme suas permissões/u);
  assert.match(timeline, /VISUALIZAR_DADO_SENSIVEL/u);
  assert.match(timeline, /projetarCamposMascarados/u);
  assert.match(projetor, /campo\.classificacao === 'SENSIVEL'/u);
  assert.ok(!tela.includes('Cliente</'));
  assert.ok(!tela.includes('Contrato</'));
  assert.ok(!tela.includes('Histórico</'));
});

test('detalhes concentra identidade, snapshot, contexto e confirmação explícita', async () => {
  const tela = await ler(
    'apps/mobile/src/telas/TelaDetalhesContatoMobile.tsx',
  );
  assert.match(tela, /Contato não identificado/u);
  assert.match(tela, /Vincular a cliente/u);
  assert.match(tela, /Contexto atual/u);
  assert.match(tela, /Situação financeira/u);
  assert.match(tela, /Identidade WhatsApp/u);
  assert.match(tela, /BSUID/u);
  assert.match(tela, /Snapshot/u);
  assert.match(tela, /Confirmar troca/u);
  assert.match(tela, /versaoEsperada: detalhes\.contexto\.versao/u);
  assert.match(tela, /acessoOffline/u);
});
