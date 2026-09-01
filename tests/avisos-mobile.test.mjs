import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('backend limita aviso a texto genérico, sequência observada e navegação', async () => {
  const compositor = await ler(
    'apps/api/src/avisos-mobile/compositor-aviso-mobile.ts',
  );
  const modelo = await ler(
    'apps/api/src/avisos-mobile/modelo-aviso-mobile.ts',
  );
  assert.match(compositor, /Abra o app/);
  assert.match(compositor, /Object\.keys\(evento\)/);
  assert.match(compositor, /evento\.conversaId \?\? evento\.atendimentoId/);
  assert.match(modelo, /sequenciaObservada/);
  assert.ok(!/cpf|cnpj|fatura|conteudoProtegido|dadosProtegidos/iu.test(compositor + modelo));
});

test('termos do provedor ficam no adaptador e simulador não entra na aplicação', async () => {
  const porta = await ler(
    'apps/api/src/avisos-mobile/porta-entrega-aviso-mobile.ts',
  );
  const modulo = await ler('apps/api/src/modulo-aplicacao.ts');
  assert.match(porta, /PortaEntregaAvisoMobile/);
  assert.ok(!/Expo|APNs|FCM|token/u.test(porta));
  assert.ok(!/AdaptadorPushSimulado/u.test(modulo));
});

test('app sincroniza antes de navegar e nunca aplica a notificação na réplica', async () => {
  const coordenador = await ler(
    'apps/mobile/src/avisos/coordenador-avisos-mobile.ts',
  );
  assert.ok(
    coordenador.indexOf('await this.sincronizarUmaVez()') <
      coordenador.indexOf('this.navegador.abrirConversa'),
  );
  assert.match(coordenador, /sincronizacaoEmCurso/);
  assert.ok(!/SQLite|aplicar|marcar.*lida|persistir/iu.test(coordenador));
});

test('adaptador nativo aceita allowlist mínima e ignora payload inesperado', async () => {
  const adaptador = await ler(
    'apps/mobile/src/avisos/adaptadores/push/adaptador-push-expo.ts',
  );
  const configuracao = JSON.parse(await ler('apps/mobile/app.json'));
  assert.match(adaptador, /Object\.keys\(dados\)/);
  assert.match(adaptador, /getLastNotificationResponseAsync/);
  assert.match(adaptador, /addNotificationResponseReceivedListener/);
  assert.ok(!/cpf|cnpj|fatura|conteudo/iu.test(adaptador));
  assert.ok(configuracao.expo.plugins.includes('expo-notifications'));
});
