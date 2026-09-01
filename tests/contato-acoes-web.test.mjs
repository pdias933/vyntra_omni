import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('detalhes autorizam antes do contato e separam snapshot de tempo real', async () => {
  const servico = await ler('apps/api/src/console-web/servico-contato-acoes-web.ts');
  assert.ok(servico.indexOf('autorizarAtendimento') < servico.indexOf('transacao.contato.findUnique'));
  assert.match(servico, /origem: 'SNAPSHOT'/u);
  assert.match(servico, /origem: 'TEMPO_REAL'/u);
  assert.match(servico, /ERP_NAO_CONFIGURADO/u);
  const consultaFinanceira = servico.slice(servico.indexOf('public async consultarFinanceiro'), servico.indexOf('public async prepararAcao'));
  assert.doesNotMatch(consultaFinanceira, /snapshot/iu);
});

test('ações sensíveis exigem confirmação literal e idempotência', async () => {
  const dto = await ler('apps/api/src/console-web/dto/console-web.dto.ts');
  const servico = await ler('apps/api/src/console-web/servico-contato-acoes-web.ts');
  assert.match(dto, /@Equals\(true\)/u);
  assert.match(dto, /chave_idempotencia/u);
  assert.match(servico, /confirmacaoExplicita: true/u);
  assert.match(servico, /this\.desbloqueios\.executar/u);
  assert.match(servico, /this\.ordens\.criar/u);
});

test('web usa apenas SDK gerado e preserva rascunho ao abrir detalhes', async () => {
  const tela = await ler('apps/web/src/web/atendimentos/ConversaWeb.tsx');
  assert.match(tela, /obterDetalhesContatoWeb/u);
  assert.match(tela, /alterarContextoContatoWeb/u);
  assert.match(tela, /prepararAcaoErpContatoWeb/u);
  assert.match(tela, /confirmacao_explicita: true/u);
  assert.doesNotMatch(tela, /fetch\(/u);
  assert.ok(tela.indexOf('<ComposerWeb') < tela.indexOf("painel === 'CONTATO'"));
});
