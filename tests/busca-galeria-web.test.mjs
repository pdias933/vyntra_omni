import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('busca e galeria filtram no PostgreSQL depois de resolver o escopo', async () => {
  const servico = await ler('apps/api/src/console-web/servico-busca-galeria-web.ts');
  assert.ok(servico.indexOf('resolverEscopo') < servico.indexOf('transacao.$queryRaw'));
  assert.match(servico, /to_tsvector\('portuguese'/u);
  assert.match(servico, /websearch_to_tsquery\('portuguese'/u);
  assert.match(servico, /atendimento_id" IN/u);
  assert.match(servico, /LIMIT \$\{LIMITE \+ 1\}/u);
  assert.doesNotMatch(servico, /\.filter\(/u);
});

test('migration cria índices aditivos para texto, mídia e links', async () => {
  const migration = await ler('apps/api/prisma/migrations/20260901015500_busca_galeria_web/migration.sql');
  assert.match(migration, /mensagem_busca_texto_pt_idx/u);
  assert.match(migration, /mensagem_galeria_conversa_tipo_recebida_idx/u);
  assert.match(migration, /mensagem_link_texto_trgm_idx/u);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE FROM/iu);
});

test('web usa SDK gerado, pagina resultados e não oferece atualização manual', async () => {
  const tela = await ler('apps/web/src/web/atendimentos/ConversaWeb.tsx');
  assert.match(tela, /buscarConversaWeb/u);
  assert.match(tela, /listarGaleriaConversaWeb/u);
  assert.match(tela, /Carregar mais/u);
  assert.match(tela, /prefers-reduced-motion/u);
  assert.doesNotMatch(tela, /Última atualização|Atualizar agora/u);
});
