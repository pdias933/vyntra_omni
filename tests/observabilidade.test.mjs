import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('métricas HTTP têm cardinalidade fechada e não capturam rota ou identidade', async () => {
  const [middleware, registro] = await Promise.all([
    ler('apps/api/src/observabilidade/middleware-correlacao.ts'),
    ler('apps/api/src/observabilidade/registro-metricas.ts'),
  ]);
  assert.match(middleware, /metricas\.observarHttp\(resposta\.statusCode, duracaoMs\)/u);
  assert.doesNotMatch(middleware, /originalUrl|requisicao\.url|requisicao\.path|usuarioId/u);
  assert.match(registro, /LIMITES_DURACAO_MS/u);
  assert.doesNotMatch(registro, /Record<string|Map</u);
});

test('trace técnico aceita somente W3C fechado e logs usam allowlist', async () => {
  const [middleware, logger, sanitizador] = await Promise.all([
    ler('apps/api/src/observabilidade/middleware-correlacao.ts'),
    ler('apps/api/src/observabilidade/logger-estruturado.ts'),
    ler('apps/api/src/observabilidade/sanitizador-logs.ts'),
  ]);
  assert.match(middleware, /TRACEPARENT_SEGURO/u);
  assert.match(middleware, /randomBytes\(16\)/u);
  assert.match(logger, /trace_id: rastreio\?\.traceId/u);
  assert.match(sanitizador, /'trace_id'/u);
  assert.doesNotMatch(sanitizador, /'payload'/u);
  assert.match(await ler('apps/api/src/configurar-aplicacao.ts'), /'traceparent'/u);
});

test('alertas dependem de RBAC, agregados e runbook sem identificador de negócio', async () => {
  const [servico, modelo, controlador, monitor] = await Promise.all([
    ler('apps/api/src/observabilidade/servico-observabilidade.ts'),
    ler('apps/api/src/observabilidade/modelo-observabilidade.ts'),
    ler('apps/api/src/observabilidade/controlador-observabilidade.ts'),
    ler('apps/api/src/observabilidade/monitor-alertas-operacionais.ts'),
  ]);
  assert.ok(servico.indexOf("permissao: 'ADMINISTRAR_INTEGRACOES'") < servico.indexOf('itemCaixaSaida.count'));
  assert.match(servico, /runbook/u);
  assert.match(modelo, /versaoRegras: 1/u);
  assert.match(controlador, /ApiCookieAuth\('sessaoWeb'\)/u);
  assert.doesNotMatch(modelo, /usuarioId|atendimentoId|mensagemId|conteudo|telefone/u);
  assert.match(monitor, /ALERTA_OPERACIONAL_ATIVO/u);
  assert.match(monitor, /ALERTA_OPERACIONAL_RESOLVIDO/u);
  assert.match(monitor, /\.unref\(\)/u);
});

test('web observa pelo SDK e apresenta alerta sem recalcular regra', async () => {
  const web = await ler('apps/web/src/web/saude/SaudeReleasesWeb.tsx');
  assert.match(web, /observarOperacao/u);
  assert.doesNotMatch(web, /fetch\(/u);
  assert.match(web, /alerta\.runbook/u);
  assert.doesNotMatch(web, /idade_item_mais_antigo_segundos\s*>/u);
});
