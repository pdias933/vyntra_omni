import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('migration mantém QR e comprovante somente como hash e impõe estados coerentes', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831000800_criar_pareamento_qr/migration.sql',
    ),
  ]);
  assert.match(schema, /model PareamentoQr/);
  assert.match(schema, /model TentativaResgatePareamentoQr/);
  assert.match(schema, /tokenQrHash\s+String\s+@unique/);
  assert.match(schema, /comprovanteResgateHash\s+String\?\s+@unique/);
  assert.match(migration, /pareamento_qr_estado_check/);
  assert.match(migration, /pareamento_qr_resgate_check/);
  assert.match(migration, /pareamento_qr_sessao_web_ativo_key/);
  assert.match(migration, /AGUARDANDO_RESGATE/);
  assert.match(migration, /AGUARDANDO_CONFIRMACAO/);
  assert.match(migration, /CONFIRMADO/);
  assert.match(migration, /CONCLUIDO/);
  assert.match(migration, /CANCELADO/);
  assert.match(migration, /EXPIRADO/);
  assert.ok(!schema.includes('tokenQrBruto'));
  assert.ok(!schema.includes('comprovanteResgateBruto'));
});

test('serviço aplica expiração curta, uso único, limites e vínculo ao aparelho', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/autenticacao/servico-pareamento-qr.ts'),
    ler('apps/api/src/autenticacao/repositorio-pareamento-qr-prisma.ts'),
  ]);
  assert.match(servico, /DURACAO_PAREAMENTO_MS = 90 \* 1_000/);
  assert.match(servico, /JANELA_AUTENTICACAO_RECENTE_MS = 10 \* 60 \* 1_000/);
  assert.match(servico, /LIMITE_GERACOES = 5/);
  assert.match(servico, /LIMITE_RESGATES = 10/);
  assert.match(servico, /timingSafeEqual/);
  assert.match(servico, /mesmoDispositivo/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(repositorio, /estado: 'AGUARDANDO_RESGATE'/);
  assert.match(repositorio, /estado: 'CONFIRMADO'/);
});

test('web confirma e mobile resgata, consulta e conclui por contratos separados', async () => {
  const [web, mobile] = await Promise.all([
    ler('apps/api/src/autenticacao/controlador-autenticacao-web.ts'),
    ler('apps/api/src/autenticacao/controlador-autenticacao-mobile.ts'),
  ]);
  assert.match(web, /pareamentos-qr\/:pareamentoId\/confirmar/);
  assert.match(web, /pareamentos-qr\/:pareamentoId\/cancelar/);
  assert.match(web, /this\.origens\.validar\(origem\)/);
  assert.match(web, /obterTokenCsrfWeb/);
  assert.match(mobile, /pareamentos-qr\/resgatar/);
  assert.match(mobile, /pareamentos-qr\/consultar/);
  assert.match(mobile, /pareamentos-qr\/concluir/);
  assert.ok(!web.includes('comprovante_resgate'));
  assert.ok(!web.includes('token_acesso'));
  assert.ok(!web.includes('token_refresh'));
});

test('revogar sessão web cancela pareamento pendente sem depender do Redis', async () => {
  const repositorio = await ler(
    'apps/api/src/autenticacao/repositorio-autenticacao-prisma.ts',
  );
  assert.match(repositorio, /transacao\.pareamentoQr\.updateMany/);
  assert.match(repositorio, /SESSAO_WEB_REVOGADA/);
  assert.match(repositorio, /estado: 'CANCELADO'/);
  assert.ok(!repositorio.includes('redis'));
});
