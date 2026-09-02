import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('app avalia a política pública antes de acessar a sessão protegida', async () => {
  const [aplicacao, adaptador] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/atualizacao/adaptador-politica-versao-http.ts'),
  ]);

  assert.match(adaptador, /avaliarVersaoMobile/);
  assert.match(adaptador, /@vyntra\/api-client/);
  assert.match(adaptador, /CONFIGURACAO_APLICATIVO\.versao/);
  assert.match(
    aplicacao,
    /useEffect\(\(\) => \{\s+if \(estadoPolitica !== 'PERMITIDA'\) return;[\s\S]{0,300}possuiSessaoPersistida\(\)/,
  );
});

test('versão obrigatória bloqueia todo o shell e não oferece adiamento', async () => {
  const [aplicacao, tela] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/telas/TelaAtualizacaoObrigatoria.tsx'),
  ]);

  assert.match(aplicacao, /estadoPolitica === 'OBRIGATORIA'/);
  assert.match(tela, /Atualização necessária/);
  assert.match(tela, /Não é possível ignorar esta atualização/);
  assert.ok(!tela.includes('Lembrar depois'));
  assert.ok(!tela.includes('Agora não'));
});

test('login, restauração e QR promovem resposta 426 ao bloqueio global', async () => {
  const [aplicacao, entrada, qr] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/telas/TelaEntrada.tsx'),
    ler('apps/mobile/src/telas/TelaPareamentoQr.tsx'),
  ]);

  assert.match(aplicacao, /ATUALIZACAO_OBRIGATORIA/);
  assert.match(aplicacao, /erro\.statusHttp !== 426/);
  assert.match(aplicacao, /exigirAtualizacao\(erro\)/);
  assert.match(entrada, /aoExigirAtualizacao\(falha\)/);
  assert.match(qr, /aoExigirAtualizacao\(falha\)/);
});

test('abertura da loja usa URL HTTPS permitida pelo adapter nativo', async () => {
  const loja = await ler(
    'apps/mobile/src/atualizacao/adaptador-loja-aplicativo.ts',
  );

  assert.match(loja, /play\.google\.com/);
  assert.match(loja, /apps\.apple\.com/);
  assert.match(loja, /url\.protocol !== 'https:'/);
  assert.match(loja, /Linking\.canOpenURL/);
  assert.match(loja, /Linking\.openURL/);
});

test('atualização recomendada permanece não bloqueante e restrita ao Perfil', async () => {
  const [aplicacao, navegacao] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
  ]);

  assert.match(aplicacao, /politica\.atualizacaoObrigatoria \? 'OBRIGATORIA' : 'PERMITIDA'/);
  assert.match(navegacao, /politicaVersao\?\.atualizacaoRecomendada === true/);
  assert.match(navegacao, /Você pode continuar trabalhando/);
  assert.ok(!aplicacao.includes('Alert.alert'));
});

test('retorno ao primeiro plano reavalia a política sem indicador operacional', async () => {
  const aplicacao = await ler('apps/mobile/src/Aplicacao.tsx');

  assert.match(aplicacao, /proximo === 'active'/);
  assert.match(aplicacao, /verificarPolitica\(false\)/);
  assert.ok(!aplicacao.includes('Última atualização'));
  assert.ok(!aplicacao.includes('Sincronizando versão'));
});
