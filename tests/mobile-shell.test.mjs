import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('shell mobile oferece navegação principal sem dados operacionais fictícios', async () => {
  const [aplicacao, navegacao] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
  ]);

  assert.match(aplicacao, /GestureHandlerRootView/);
  assert.match(aplicacao, /NavigationContainer/);
  assert.match(aplicacao, /TEMPO_PARA_BLOQUEAR_MS/);
  for (const aba of ['Atendimentos', 'Contatos', 'Notificações', 'Perfil']) {
    assert.match(navegacao, new RegExp(`name="${aba}"`));
  }
  assert.ok(!navegacao.includes('João da Silva'));
  assert.ok(!navegacao.includes('ultima atualizacao'));
});

test('login mobile usa SDK, MFA e cofre sem persistir access token', async () => {
  const [adaptador, servico, cofre, tela] = await Promise.all([
    ler('apps/mobile/src/autenticacao/adaptador-autenticacao-http.ts'),
    ler('apps/mobile/src/autenticacao/servico-autenticacao-aplicativo.ts'),
    ler('apps/mobile/src/autenticacao/cofre-sessao-mobile.ts'),
    ler('apps/mobile/src/telas/TelaEntrada.tsx'),
  ]);

  assert.match(adaptador, /@vyntra\/api-client/);
  assert.match(adaptador, /entrarSessaoMobile/);
  assert.match(adaptador, /renovarSessaoMobile/);
  assert.match(servico, /gerenciador\.ativar/);
  assert.match(tela, /MFA_NECESSARIO/);
  assert.match(tela, /textContentType="oneTimeCode"/);
  assert.ok(!cofre.includes('CHAVE_TOKEN_ACESSO'));
  assert.ok(!adaptador.includes('Meta'));
  assert.ok(!adaptador.includes('MK'));
});

test('desbloqueio local respeita biometria e código seguro do aparelho', async () => {
  const [biometria, manifesto] = await Promise.all([
    ler('apps/mobile/src/autenticacao/biometria-mobile.ts'),
    ler('apps/mobile/app.json'),
  ]);

  assert.match(biometria, /expo-local-authentication/);
  assert.match(biometria, /hasHardwareAsync/);
  assert.match(biometria, /isEnrolledAsync/);
  assert.match(biometria, /authenticateAsync/);
  assert.match(manifesto, /expo-local-authentication/);
  assert.match(manifesto, /configureAndroidBackup/);
});

test('pareamento QR mantém segredo efêmero em memória e exige confirmação web', async () => {
  const [telaQr, servico, web] = await Promise.all([
    ler('apps/mobile/src/telas/TelaPareamentoQr.tsx'),
    ler('apps/mobile/src/autenticacao/servico-autenticacao-aplicativo.ts'),
    ler('apps/web/src/web/PareamentoCelularWeb.tsx'),
  ]);

  assert.match(telaQr, /CameraView/);
  assert.match(telaQr, /TOKEN_QR/);
  assert.match(servico, /consultarPareamento/);
  assert.match(servico, /concluirPareamento/);
  assert.match(web, /QRCodeSVG/);
  assert.match(web, /confirmarPareamentoQrWeb/);
  assert.ok(!servico.includes('AsyncStorage'));
  assert.ok(!servico.includes('SQLite'));
});

test('animação e haptics não substituem o resultado das ações', async () => {
  const [entrada, navegacao, carregamento] = await Promise.all([
    ler('apps/mobile/src/telas/TelaEntrada.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
    ler('apps/mobile/src/telas/TelaCarregamento.tsx'),
  ]);

  assert.match(entrada, /ReduceMotion\.System/);
  assert.match(entrada, /Haptics\.notificationAsync/);
  assert.match(navegacao, /Haptics\.selectionAsync/);
  assert.match(carregamento, /reduceMotion: ReduceMotion\.System/);
});
