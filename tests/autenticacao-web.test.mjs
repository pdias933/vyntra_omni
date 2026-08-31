import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('migration separa credencial, sessão e tentativa sem token bruto', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831000500_criar_credencial_sessao_web/migration.sql',
    ),
  ]);
  assert.match(schema, /model CredencialSenha/);
  assert.match(schema, /model SessaoWeb/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.match(schema, /csrfHash\s+String/);
  assert.ok(!schema.includes('tokenBruto'));
  assert.match(migration, /credencial_senha_hash_argon2id_check/);
  assert.match(migration, /sessao_web_revogacao_check/);
  assert.match(migration, /sessao_web_expiracao_check/);
  assert.match(migration, /tentativa_login_web_identificador_ip_idx/);
});

test('cookie, origem, CSRF e CORS são guardas obrigatórias', async () => {
  const [cookies, controlador, origem, aplicacao] = await Promise.all([
    ler('apps/api/src/autenticacao/cookies-sessao-web.ts'),
    ler('apps/api/src/autenticacao/controlador-autenticacao-web.ts'),
    ler('apps/api/src/autenticacao/servico-origem-web.ts'),
    ler('apps/api/src/configurar-aplicacao.ts'),
  ]);
  assert.match(cookies, /__Host-vyntra_sessao/);
  assert.match(cookies, /Secure; SameSite=Strict/);
  assert.match(cookies, /HttpOnly/);
  assert.match(controlador, /obterTokenCsrfWeb/);
  assert.match(controlador, /this\.origens\.validar\(origem\)/);
  assert.match(origem, /url\.protocol === 'https:'/);
  assert.match(aplicacao, /credentials: true/);
  assert.match(aplicacao, /x-csrf-token/);
  assert.ok(!aplicacao.includes('origin: true'));
});

test('login usa Argon2id, enumeração uniforme e transações auditadas', async () => {
  const [senha, servico, repositorio] = await Promise.all([
    ler('apps/api/src/autenticacao/servico-senha.ts'),
    ler('apps/api/src/autenticacao/servico-autenticacao-web.ts'),
    ler('apps/api/src/autenticacao/repositorio-autenticacao-prisma.ts'),
  ]);
  assert.match(senha, /argon2\('argon2id'/);
  assert.match(senha, /MEMORIA_KIB = 65_536/);
  assert.match(senha, /ITERACOES = 3/);
  assert.match(servico, /simularVerificacao/);
  assert.match(servico, /LIMITE_CONTA_IP = 5/);
  assert.match(servico, /LIMITE_IP = 50/);
  assert.match(servico, /this\.prisma\.executarTransacao/);
  assert.match(servico, /LOGIN_WEB_CONCLUIDO/);
  assert.match(servico, /LOGIN_WEB_MFA_NECESSARIO/);
  assert.match(repositorio, /tokenHashAtual/);
  assert.match(repositorio, /updateMany/);
  assert.ok(!repositorio.includes('findMany'));
});
