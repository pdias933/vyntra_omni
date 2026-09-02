import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('caixa agrupa rajadas pela chave da conversa e ignora repetição antiga', async () => {
  const caixa = await ler('apps/mobile/src/avisos/caixa-avisos-mobile.ts');
  assert.match(caixa, /new Map<string, GrupoAvisosMobile>/u);
  assert.match(caixa, /aviso\.chaveAgrupamento/u);
  assert.match(caixa, /sequenciaObservada/u);
  assert.match(caixa, /\(atual\?\.quantidade \?\? 0\) \+ 1/u);
  assert.match(caixa, /LIMITE_GRUPOS = 100/u);
  assert.doesNotMatch(caixa, /SQLite|SecureStore|AsyncStorage/u);
});

test('tela cobre exatamente os cinco avisos com conteúdo genérico', async () => {
  const tela = await ler('apps/mobile/src/telas/TelaNotificacoesMobile.tsx');
  for (const tipo of [
    'CLIENTE_AGUARDANDO',
    'JANELA_EXPIRANDO',
    'NOVA_MENSAGEM',
    'NOVO_PENDENTE',
    'TRANSFERENCIA_DIRETA',
  ]) assert.match(tela, new RegExp(`${tipo}:`, 'u'));
  assert.match(tela, /FlatList/u);
  assert.match(tela, /Sincronizando atendimento/u);
  assert.ok(!/cpf|cnpj|fatura|conteúdo da mensagem/iu.test(tela));
});

test('badge e aba usam a mesma caixa agrupada, sem contador derivado de push bruto', async () => {
  const navegacao = await ler(
    'apps/mobile/src/navegacao/NavegacaoPrincipal.tsx',
  );
  assert.match(navegacao, /caixaAvisos\.listar\(\)\.length/u);
  assert.match(navegacao, /caixaAvisos\.observar/u);
  assert.match(navegacao, /tabBarBadge/u);
  assert.match(navegacao, /TelaNotificacoesMobile/u);
});

test('abertura aguarda a sequência observada antes de navegar', async () => {
  const coordenador = await ler(
    'apps/mobile/src/avisos/coordenador-avisos-mobile.ts',
  );
  const motor = await ler(
    'apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts',
  );
  assert.ok(
    coordenador.indexOf('await this.sincronizarAte(aviso.sequenciaObservada)') <
      coordenador.indexOf('this.navegador.abrirConversa'),
  );
  assert.match(coordenador, /sequenciaSolicitada/u);
  assert.match(motor, /BigInt\(estado\.sequenciaEvento\) >= minima/u);
  assert.match(motor, /estado !== 'CONECTADO'/u);
  assert.match(motor, /precisaRessincronizar/u);
});

test('navegação resolve novamente o destino na réplica autorizada', async () => {
  const aplicacao = await ler('apps/mobile/src/Aplicacao.tsx');
  const repositorio = await ler(
    'apps/mobile/src/offline/repositorio-replica-local.ts',
  );
  assert.match(aplicacao, /DESTINO_AVISO_NAO_AUTORIZADO/u);
  assert.match(aplicacao, /obterResumoAtendimentoPorConversa/u);
  assert.match(aplicacao, /screen: 'Conversa'/u);
  assert.match(repositorio, /WHERE conversa_id = \?/u);
  assert.match(repositorio, /estado IN \('AGUARDANDO', 'EM_ATENDIMENTO'\)/u);
});

test('push é ligado somente na sessão autenticada e limpo na troca de usuário', async () => {
  const aplicacao = await ler('apps/mobile/src/Aplicacao.tsx');
  const adaptador = await ler(
    'apps/mobile/src/avisos/adaptadores/push/adaptador-push-expo.ts',
  );
  assert.match(aplicacao, /estado !== 'AUTENTICADO'/u);
  assert.match(aplicacao, /adaptadorPush\.iniciar\(coordenadorAvisos\)/u);
  assert.match(aplicacao, /coordenadorAvisos\.limpar\(\)/u);
  assert.match(adaptador, /Object\.keys\(dados\)/u);
  assert.match(adaptador, /clearLastNotificationResponseAsync/u);
});
