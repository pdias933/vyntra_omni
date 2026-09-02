import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('saúde administrativa autoriza antes de observar componentes ou falhas', async () => {
  const [servico, controlador] = await Promise.all([
    ler('apps/api/src/saude/servico-saude-administrativa.ts'),
    ler('apps/api/src/saude/controlador-saude-administrativa.ts'),
  ]);
  assert.match(servico, /ADMINISTRAR_INTEGRACOES/);
  assert.ok(servico.indexOf('await this.autorizar') < servico.indexOf('this.prontidao.verificar'));
  assert.match(controlador, /ApiCookieAuth\('sessaoWeb'\)/);
  assert.match(controlador, /NOME_HEADER_CSRF_WEB/);
  assert.match(controlador, /this\.origens\.validar/);
  assert.doesNotMatch(controlador, /resultadoProtegido|dadosProtegidos/);
});

test('reprocessamento apenas antecipa a agenda e preserva o caminho de reconciliação', async () => {
  const servico = await ler('apps/api/src/saude/servico-saude-administrativa.ts');
  assert.match(servico, /'AGUARDANDO_NOVA_TENTATIVA',\s*'RESULTADO_INCERTO'/u);
  assert.match(servico, /proximaAcaoEm: agora/);
  assert.match(servico, /OPERACAO_REPROCESSAMENTO_ANTECIPADO/);
  assert.doesNotMatch(servico, /data:\s*\{[^}]*estado:\s*'PENDENTE'/su);
  assert.doesNotMatch(servico, /adaptador|adapter|executarEfeito|chamarIntegracao/iu);
});

test('web usa SDK, atualização silenciosa e confirmação para reprocessar e liberar', async () => {
  const [pagina, shell, cliente] = await Promise.all([
    ler('apps/web/src/web/saude/SaudeReleasesWeb.tsx'),
    ler('apps/web/src/web/ShellWeb.tsx'),
    ler('packages/api-client/src/gerado/index.ts'),
  ]);
  assert.match(shell, /<SaudeReleasesWeb/);
  assert.match(pagina, /setInterval\(/);
  assert.match(pagina, /carregarSaude\(\)/);
  assert.match(pagina, /carregarObservabilidade\(\)/);
  assert.match(pagina, /15_000/);
  assert.match(pagina, /Reprocessar agora/);
  assert.match(pagina, /Atualização obrigatória/);
  assert.match(pagina, /confirmar\(/);
  assert.doesNotMatch(pagina, /fetch\(/);
  assert.match(cliente, /listarSaudeAdministrativa/);
  assert.match(cliente, /reprocessarOperacaoAgora/);
  assert.match(cliente, /atualizarControleRecurso/);
  assert.match(cliente, /atualizarPoliticaVersaoMobile/);
  assert.match(cliente, /observarOperacao/);
});
