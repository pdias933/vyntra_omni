import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('persistência guarda rollout, alvos e política por plataforma com invariantes', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831000900_criar_controles_recurso_versao/migration.sql',
    ),
  ]);
  assert.match(schema, /model ControleRecurso/);
  assert.match(schema, /model PoliticaVersaoMobile/);
  assert.match(migration, /controle_recurso_percentual_check/);
  assert.match(migration, /politica_versao_mobile_ordem_check/);
  assert.match(migration, /politica_versao_mobile_url_obrigatoria_check/);
  assert.match(migration, /INSERT INTO "politica_versao_mobile"/);
  assert.match(migration, /'IOS'/);
  assert.match(migration, /'ANDROID'/);
});

test('backend é autoridade para kill switch, rollout e atualização obrigatória', async () => {
  const [releases, mobile, pareamento] = await Promise.all([
    ler('apps/api/src/releases/servico-releases.ts'),
    ler('apps/api/src/autenticacao/servico-autenticacao-mobile.ts'),
    ler('apps/api/src/autenticacao/servico-pareamento-qr.ts'),
  ]);
  assert.match(releases, /desligadoEmergencialmente/);
  assert.match(releases, /percentualLiberacao/);
  assert.match(releases, /ADMINISTRAR_RELEASES/);
  assert.match(releases, /pg_advisory|serializarControle/);
  assert.match(mobile, /exigirVersaoPermitida/);
  assert.match(pareamento, /exigirVersaoPermitida/);
});

test('contratos separam avaliação pública, configuração autenticada e administração', async () => {
  const controlador = await ler('apps/api/src/releases/controlador-releases.ts');
  assert.match(controlador, /configuracao\/mobile\/avaliar/);
  assert.match(controlador, /configuracao\/mobile\/atual/);
  assert.match(controlador, /configuracao\/web\/atual/);
  assert.match(controlador, /administracao\/releases/);
  assert.match(controlador, /obterTokenCsrfWeb/);
  assert.match(controlador, /this\.origens\.validar\(origem\)/);
});

test('erros de release têm respostas canônicas e bloqueio usa HTTP 426', async () => {
  const filtro = await ler('apps/api/src/http/filtro-excecao-http.ts');
  assert.match(filtro, /ATUALIZACAO_OBRIGATORIA/);
  assert.match(filtro, /CONFIGURACAO_RELEASE_INVALIDA/);
  assert.match(filtro, /CONFLITO_VERSAO_RELEASE/);
  assert.match(filtro, /ErroAtualizacaoObrigatoria\) return 426/);
});
