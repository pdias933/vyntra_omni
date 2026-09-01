import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('marcador pessoal possui chaves restritivas e migration aditiva', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler('apps/api/prisma/migrations/20260901014000_marcador_leitura_web/migration.sql'),
  ]);
  assert.match(schema, /model MarcadorLeituraConversaUsuario/);
  assert.match(schema, /@@id\(\[usuarioId, conversaId\]\)/);
  assert.match(migration, /FOREIGN KEY \("usuario_id"\)/);
  assert.match(migration, /FOREIGN KEY \("conversa_id"\)/);
  assert.doesNotMatch(migration, /^\s*(DROP|DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN)/imu);
});

test('lista filtra conteúdo no PostgreSQL depois da autorização de fila', async () => {
  const servico = await ler('apps/api/src/console-web/servico-lista-atendimentos-web.ts');
  assert.match(servico, /this\.autorizacao\.autorizar/);
  assert.match(servico, /a\."fila_atual_id" IN/);
  assert.match(servico, /LIMIT 60/);
  assert.match(servico, /marcador\."marcada_nao_lida"/);
  assert.match(servico, /execucao_fluxo/);
  assert.doesNotMatch(servico, /findMany\([\s\S]*conteudoProtegido/);
});

test('web usa somente seis filtros, SDK e atualização silenciosa por evento', async () => {
  const tela = await ler('apps/web/src/web/atendimentos/ListaAtendimentosWeb.tsx');
  const filtros = ['Meus', 'Pendentes', 'Não lidos', 'SLA', 'Expirando', 'Em automação'];
  for (const filtro of filtros) assert.match(tela, new RegExp(`rotulo: '${filtro}'`));
  assert.match(tela, /listarAtendimentosWeb/);
  assert.match(tela, /vyntra:evento/);
  assert.match(tela, /data-conversa-id/);
  assert.doesNotMatch(tela, /Puxe para atualizar|Última atualização|Atualizar/);
});
