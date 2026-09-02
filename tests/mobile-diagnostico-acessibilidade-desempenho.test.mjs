import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('diagnóstico reúne somente campos técnicos sanitizados e limitados', async () => {
  const [servico, motor, push] = await Promise.all([
    ler('apps/mobile/src/diagnostico/servico-diagnostico-mobile.ts'),
    ler('apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts'),
    ler('apps/mobile/src/avisos/adaptadores/push/adaptador-push-expo.ts'),
  ]);
  for (const campo of [
    'versaoAplicativo',
    'versaoSistemaOperacional',
    'modeloDispositivo',
    'servidor',
    'estadoWebSocket',
    'estadoPush',
    'estadoSincronizacao',
    'ultimaSequenciaAplicada',
    'codigosFalhaRecentes',
  ]) assert.match(servico, new RegExp(campo, 'u'));
  assert.match(servico, /CODIGO_SANITIZADO/u);
  assert.match(servico, /LIMITE_CODIGOS = 10/u);
  assert.match(servico, /LIMITE_RELATORIO_CARACTERES = 2_048/u);
  assert.match(motor, /falhasRecentes\.length > 10/u);
  assert.match(push, /LIMITE_RESPOSTAS_PROCESSADAS = 200/u);
});

test('relatório só sai por ação consentida e declara o conteúdo excluído', async () => {
  const [tela, navegacao] = await Promise.all([
    ler('apps/mobile/src/telas/TelaDiagnosticoMobile.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
  ]);
  assert.match(tela, /Alert\.alert\(/u);
  assert.match(tela, /Compartilhar diagnóstico\?/u);
  assert.match(tela, /não inclui mensagens, contatos, credenciais ou identificadores/u);
  assert.match(tela, /Share\.share/u);
  assert.match(navegacao, /Perfil.*Diagnostico/su);
  assert.match(navegacao, /Mostra informações técnicas sem conteúdo de conversa/u);
});

test('listas críticas são virtualizadas e limitam o trabalho por lote', async () => {
  const [lista, timeline, avisos] = await Promise.all([
    ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx'),
    ler('apps/mobile/src/telas/TelaConversaMobile.tsx'),
    ler('apps/mobile/src/telas/TelaNotificacoesMobile.tsx'),
  ]);
  for (const tela of [lista, timeline, avisos]) {
    assert.match(tela, /initialNumToRender/u);
    assert.match(tela, /maxToRenderPerBatch/u);
    assert.match(tela, /windowSize/u);
    assert.match(tela, /updateCellsBatchingPeriod/u);
  }
  assert.match(lista, /memo\(function CartaoAtendimento/u);
  assert.match(lista, /preservarItensInalterados/u);
  assert.match(lista, /accessibilityLabel/u);
  assert.match(timeline, /maintainVisibleContentPosition/u);
});

test('cache operacional e timeline possuem tetos explícitos sem bytes de mídia', async () => {
  const [servidor, contrato, repositorio, midia] = await Promise.all([
    ler('apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts'),
    ler('apps/mobile/src/sincronizacao/modelo-sincronizacao-mobile.ts'),
    ler('apps/mobile/src/offline/repositorio-replica-local.ts'),
    ler('apps/mobile/src/midias/adaptador-selecao-midia-nativa.ts'),
  ]);
  assert.match(servidor, /LIMIT 200/u);
  assert.match(servidor, /WHERE posicao<=200/gu);
  assert.match(contrato, /LIMITE_SNAPSHOT_CARACTERES = 64 \* 1_024 \* 1_024/u);
  assert.match(repositorio, /LIMIT 60/u);
  assert.match(repositorio, /LIMIT 200/gu);
  assert.doesNotMatch(repositorio, /BLOB/u);
  assert.match(midia, /LIMITES_POR_MIME/u);
  assert.doesNotMatch(midia.slice(0, midia.indexOf('public async materializar')), /\.blob\(/u);
});

test('movimento reduzido preserva navegação, skeleton, lista e folhas', async () => {
  const [aplicacao, navegacao, lista, composer] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
    ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx'),
    ler('apps/mobile/src/componentes/ComposerMobile.tsx'),
  ]);
  assert.match(aplicacao, /useReducedMotion/u);
  assert.match(navegacao, /animation: reduzirMovimento \? 'none'/u);
  assert.match(lista, /ReduceMotion\.System/u);
  assert.match(lista, /reduzirMovimento[\s\S]*itemLayoutAnimation/u);
  assert.match(composer, /animationType=\{reduzirMovimento \? 'fade' : 'slide'\}/u);
});
