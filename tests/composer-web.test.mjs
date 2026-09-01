import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('composer usa domínio de mensagens, idempotência e autorização central', async () => {
  const [servico, mensagens] = await Promise.all([
    ler('apps/api/src/console-web/servico-composer-web.ts'),
    ler('apps/api/src/mensagens/servico-mensagens-saida.ts'),
  ]);
  assert.match(servico, /ServicoMensagensSaida/);
  assert.match(servico, /permissao: 'ENVIAR_MENSAGEM'/);
  assert.match(servico, /executarLeituraConsistente/);
  assert.match(mensagens, /bloquearIdempotencia/);
  assert.match(mensagens, /'MODELO_APROVADO'/);
  assert.match(mensagens, /modeloAprovado/);
});

test('resposta rápida é catálogo protegido e migration aditiva', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler('apps/api/prisma/migrations/20260901015000_resposta_rapida_web/migration.sql'),
  ]);
  assert.match(schema, /model RespostaRapida/);
  assert.match(schema, /textoProtegido\s+Json/);
  assert.match(migration, /resposta_rapida_atalho_canonico_check/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE FROM/iu);
});

test('web abre respostas com barra, preserva texto em falha e troca ação quando há conteúdo', async () => {
  const tela = await ler('apps/web/src/web/atendimentos/ConversaWeb.tsx');
  assert.match(tela, /texto\.startsWith\('\/'\)/);
  assert.match(tela, /listarRespostasRapidasWeb/);
  assert.match(tela, /listarModelosAprovadosWeb/);
  assert.match(tela, /O texto foi preservado/);
  assert.match(tela, /texto\.trim\(\)\.length > 0/);
  assert.doesNotMatch(tela, /Atualizar agora|Última atualização/);
});
