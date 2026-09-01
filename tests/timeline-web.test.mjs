import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('timeline web resolve autorização antes do conteúdo e filtra filas no banco', async () => {
  const servico = await ler('apps/api/src/console-web/servico-timeline-web.ts');
  assert.match(servico, /autorizarAtendimento/);
  assert.match(servico, /resolverFilasAutorizadas/);
  assert.match(servico, /atendimentoId: \{ in: idsAtendimentos \}/);
  assert.match(servico, /filaId: \{ in: filasAutorizadas \}/);
  assert.match(servico, /take: LIMITE \+ 1/);
  assert.match(servico, /CONFLITO_VERSAO_MARCADOR/);
  assert.doesNotMatch(servico, /dadosProtegidosMinimizados/);
});

test('migration associa nota à fila sem tornar deploy incompatível', async () => {
  const migration = await ler('apps/api/prisma/migrations/20260901014500_fila_nota_interna_web/migration.sql');
  assert.match(migration, /ADD COLUMN "fila_id" UUID/);
  assert.match(migration, /historico_atribuicao/);
  assert.match(migration, /FOREIGN KEY \("fila_id"\)/);
  assert.doesNotMatch(migration, /SET NOT NULL|DROP|TRUNCATE/iu);
});

test('web diferencia notas, eventos, formulários e mensagens sem estado de sync saudável', async () => {
  const [tela, estilos] = await Promise.all([
    ler('apps/web/src/web/atendimentos/ConversaWeb.tsx'),
    ler('apps/web/src/estilos.css'),
  ]);
  assert.match(tela, /Nota interna · Somente equipe/);
  assert.match(tela, /Ver formulário/);
  assert.match(tela, /confirmarLeituraTimelineWeb/);
  assert.match(tela, /marcarTimelineWebNaoLida/);
  assert.match(estilos, /bloco-nota-interna/);
  assert.doesNotMatch(tela, /Última atualização|Atualizar agora|Sincronizado/);
});
