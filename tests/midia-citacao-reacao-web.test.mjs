import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('upload e leitura passam por storage privado e autorização atual', async () => {
  const [controlador, composer, storage] = await Promise.all([
    ler('apps/api/src/console-web/controlador-console-web.ts'),
    ler('apps/api/src/console-web/servico-composer-web.ts'),
    ler('apps/api/src/midias/adaptador-armazenamento-s3.ts'),
  ]);
  assert.match(controlador, /FileInterceptor\('arquivo'/u);
  assert.match(controlador, /executarEscrita\(cookies, csrfCabecalho, origem/u);
  assert.match(controlador, /Cache-Control', 'private, no-store'/u);
  assert.match(composer, /permissao: 'VISUALIZAR_FILA'/u);
  assert.match(composer, /executarLeituraConsistente/u);
  assert.match(storage, /PutObjectCommand/u);
  assert.match(storage, /GetObjectCommand/u);
  assert.doesNotMatch(storage, /getSignedUrl|public-read|ACL/u);
});

test('citação mantém alvo interno e reação conservadora permanece somente da equipe', async () => {
  const [mensagens, timeline] = await Promise.all([
    ler('apps/api/src/mensagens/servico-mensagens-saida.ts'),
    ler('apps/api/src/console-web/servico-timeline-web.ts'),
  ]);
  assert.match(mensagens, /respondeAMensagemId/u);
  assert.match(mensagens, /FALLBACK_TEXTO/u);
  assert.match(mensagens, /mensagemAlvoReacaoId/u);
  assert.match(mensagens, /reacaoNativa: false/u);
  assert.match(mensagens, /modoCanal: plano\.modoCanal/u);
  assert.match(mensagens, /estadoSaida: 'CANCELADA'/u);
  assert.match(timeline, /respondeAMensagem/u);
  assert.match(timeline, /reacoes/u);
});

test('web usa cliente gerado, player, visualizador, resposta navegável e reduzir movimento', async () => {
  const [tela, cliente] = await Promise.all([
    ler('apps/web/src/web/atendimentos/ConversaWeb.tsx'),
    ler('packages/api-client/src/gerado/sdk.gen.ts'),
  ]);
  assert.match(tela, /enviarMidiaWeb/u);
  assert.match(tela, /baixarMidiaWeb/u);
  assert.match(tela, /reagirMensagemWeb/u);
  assert.match(tela, /<audio controls/u);
  assert.match(tela, /<video controls/u);
  assert.match(tela, /<iframe/u);
  assert.match(tela, /scrollIntoView/u);
  assert.match(tela, /prefers-reduced-motion/u);
  assert.match(cliente, /export const enviarMidiaWeb/u);
  assert.match(cliente, /export const baixarMidiaWeb/u);
});
