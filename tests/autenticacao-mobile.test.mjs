import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('modelo mobile separa dispositivo, sessão, refresh usado e tentativa', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831000700_criar_sessao_dispositivo_mobile/migration.sql',
    ),
  ]);
  assert.match(schema, /model DispositivoMobile/);
  assert.match(schema, /model SessaoMobile/);
  assert.match(schema, /model TokenRefreshMobileUsado/);
  assert.match(schema, /model TentativaLoginMobile/);
  assert.match(migration, /sessao_mobile_expiracao_check/);
  assert.match(migration, /sessao_mobile_revogacao_check/);
  assert.match(migration, /FOREIGN KEY \("dispositivo_id", "usuario_id"\)/);
  assert.match(migration, /tentativa_login_mobile_identificador_ip_dispositivo_idx/);
  assert.ok(!schema.includes('tokenAcessoBruto'));
  assert.ok(!schema.includes('tokenRefreshBruto'));
});

test('backend usa tokens opacos, vínculo, serialização e detecção de replay', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/autenticacao/servico-autenticacao-mobile.ts'),
    ler('apps/api/src/autenticacao/repositorio-autenticacao-mobile-prisma.ts'),
  ]);
  assert.match(servico, /DURACAO_ACESSO_MS = 15 \* 60 \* 1_000/);
  assert.match(servico, /DURACAO_REFRESH_MS = 30 \* 24 \* 60 \* 60 \* 1_000/);
  assert.match(servico, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(servico, /timingSafeEqual/);
  assert.match(servico, /REPLAY_TOKEN_REFRESH_MOBILE/);
  assert.match(repositorio, /TOKEN_REFRESH_MOBILE:/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(repositorio, /tokenRefreshMobileUsado\.create/);
});

test('app persiste refresh e vínculo somente no cofre nativo', async () => {
  const [cofre, gerenciador, manifesto] = await Promise.all([
    ler('apps/mobile/src/autenticacao/cofre-sessao-mobile.ts'),
    ler('apps/mobile/src/autenticacao/gerenciador-sessao-mobile.ts'),
    ler('apps/mobile/app.json'),
  ]);
  assert.match(cofre, /expo-secure-store/);
  assert.match(cofre, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  assert.match(cofre, /CHAVE_TOKEN_REFRESH/);
  assert.ok(!cofre.includes('CHAVE_TOKEN_ACESSO'));
  assert.match(gerenciador, /private tokenAcesso/);
  assert.ok(!gerenciador.includes('AsyncStorage'));
  assert.ok(!gerenciador.includes('SQLite'));
  assert.match(manifesto, /expo-secure-store/);
});
