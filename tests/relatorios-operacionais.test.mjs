import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('relatório autoriza cada fila antes de agregar seus fatos', async () => {
  const servico = await ler('apps/api/src/relatorios-operacionais/servico-relatorios-operacionais.ts');
  assert.ok(servico.indexOf('filasAutorizadas') < servico.indexOf('atendimento.groupBy'));
  assert.match(servico, /permissao: 'VISUALIZAR_FILA'/u);
  assert.match(servico, /filaAtualId: \{ in: ids \}/u);
  assert.match(servico, /executarLeituraConsistente/u);
  assert.match(servico, /taxaEntrega: saidasAceitas === 0 \? 0/u);
});

test('web consome somente SDK gerado e documenta a fórmula exibida', async () => {
  const [web, shell] = await Promise.all([
    ler('apps/web/src/web/relatorios/RelatoriosOperacionaisWeb.tsx'),
    ler('apps/web/src/web/ShellWeb.tsx'),
  ]);
  assert.match(web, /obterRelatorioOperacional/u);
  assert.doesNotMatch(web, /fetch\(/u);
  assert.match(web, /Fórmulas v/u);
  assert.match(web, /entregues ÷ enviadas aceitas/u);
  assert.match(shell, /'\/relatorios'/u);
});

test('períodos e indicadores permanecem fechados e sem conteúdo pessoal', async () => {
  const [modelo, dto] = await Promise.all([
    ler('apps/api/src/relatorios-operacionais/modelo-relatorios-operacionais.ts'),
    ler('apps/api/src/relatorios-operacionais/dto-relatorios-operacionais.ts'),
  ]);
  assert.match(modelo, /\['24H', '7D', '30D'\]/u);
  for (const indicador of ['filas', 'sla', 'mensagens', 'fluxos', 'erp']) assert.match(modelo, new RegExp(indicador, 'u'));
  assert.doesNotMatch(dto, /nome_contato|telefone|documento|conteudo|protocolo/u);
});
