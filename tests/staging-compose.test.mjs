import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';
import {
  prepararAdministradorStaging,
  prepararChaveProtecaoMfa,
} from '../scripts/ambiente-staging.mjs';

const conteudoCompose = await readFile('compose.staging.yaml', 'utf8');
const compose = parse(conteudoCompose);
const configuracaoStorage = await readFile('infra/staging/garage.toml', 'utf8');
const configuracaoBorda = await readFile('infra/staging/Caddyfile.borda', 'utf8');
const configuracaoWeb = await readFile('infra/staging/Caddyfile.web', 'utf8');
const dockerfileWeb = await readFile('apps/web/Dockerfile', 'utf8');
const codigoStaging = await readFile('scripts/ambiente-staging.mjs', 'utf8');
const codigoVerificacaoS3 = await readFile(
  'scripts/verificar-storage-s3.mjs',
  'utf8',
);

test('declara a pilha persistente de staging com publicação web separada', () => {
  assert.deepEqual(Object.keys(compose.services).sort(), [
    'api',
    'migrar',
    'postgres',
    'provisionar_administrador',
    'proxy',
    'redis',
    'storage',
    'web',
    'worker_fluxos',
  ]);
  assert.deepEqual(Object.keys(compose.volumes).sort(), [
    'certificados_proxy_staging',
    'configuracao_proxy_staging',
    'dados_postgresql_staging',
    'dados_redis_staging',
    'dados_storage_staging',
    'metadados_storage_staging',
    'snapshots_storage_staging',
  ]);

  for (const volume of Object.values(compose.volumes)) {
    assert.equal(volume?.external, undefined);
  }

  for (const [nome, servico] of Object.entries(compose.services)) {
    assert.equal(
      servico.restart,
      ['migrar', 'provisionar_administrador'].includes(nome)
        ? 'no'
        : 'unless-stopped',
    );
    assert.equal(servico.container_name, undefined);
    assert.equal(servico.privileged, undefined);
  }
});

test('usa storage mantido e imutável sem promover o MinIO legado', () => {
  assert.equal(
    compose.services.storage.image,
    'docker.io/dxflrs/garage:v2.3.0@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690',
  );
  assert.ok(!conteudoCompose.toLowerCase().includes('minio'));
  assert.deepEqual(compose.services.storage.entrypoint, ['/garage']);
  assert.deepEqual(compose.services.storage.command, ['server', '--single-node']);
  assert.equal(compose.services.storage.read_only, true);
  assert.deepEqual(compose.services.storage.cap_drop, ['ALL']);
  assert.deepEqual(compose.services.storage.healthcheck.test, [
    'CMD',
    '/garage',
    'status',
  ]);
  assert.match(configuracaoStorage, /^replication_factor = 1$/m);
  assert.match(configuracaoStorage, /^consistency_mode = "consistent"$/m);
  assert.match(configuracaoStorage, /^db_engine = "sqlite"$/m);
  assert.match(configuracaoStorage, /^metadata_fsync = true$/m);
  assert.match(configuracaoStorage, /^data_fsync = true$/m);
  assert.match(configuracaoStorage, /^metrics_require_token = true$/m);
  assert.ok(!configuracaoStorage.includes('rpc_secret ='));
  assert.ok(!configuracaoStorage.includes('admin_token ='));
  assert.ok(!configuracaoStorage.includes('metrics_token ='));
  assert.ok(!configuracaoStorage.includes('[s3_web]'));
});

test('mantém banco, Redis e storage inacessíveis pelo host', () => {
  assert.equal(compose.networks.rede_dados_staging.internal, true);
  assert.equal(compose.networks.rede_storage_staging.internal, true);
  assert.equal(compose.networks.rede_publicada_staging.internal, false);

  for (const nome of ['postgres', 'redis', 'storage', 'web', 'worker_fluxos']) {
    assert.equal(compose.services[nome].ports, undefined, nome);
  }

  assert.deepEqual(compose.services.api.ports, [
    {
      host_ip: '127.0.0.1',
      name: 'api-staging-loopback',
      protocol: 'tcp',
      published: '3100',
      target: 3000,
    },
  ]);
  assert.deepEqual(compose.services.postgres.networks, ['rede_dados_staging']);
  assert.deepEqual(compose.services.redis.networks, ['rede_dados_staging']);
  assert.deepEqual(compose.services.storage.networks, ['rede_storage_staging']);
  assert.deepEqual(compose.services.worker_fluxos.networks, [
    'rede_dados_staging',
  ]);
  assert.equal(compose.services.worker_fluxos.ports, undefined);
  assert.deepEqual(compose.services.web.networks, ['rede_publicada_staging']);
  assert.deepEqual(compose.services.proxy.networks, ['rede_publicada_staging']);
  assert.deepEqual(compose.services.proxy.ports, [
    { name: 'web-http', published: '80', protocol: 'tcp', target: 80 },
    { name: 'web-https', published: '443', protocol: 'tcp', target: 443 },
    { name: 'web-http3', published: '443', protocol: 'udp', target: 443 },
  ]);
  assert.ok(
    compose.services.proxy.healthcheck.test.includes(
      '--header=Host: omni.up100.com.br',
    ),
  );
});

test('separa todos os segredos e não aceita credencial de produção', () => {
  assert.deepEqual(Object.keys(compose.secrets).sort(), [
    'chave_autorizacao_offline',
    'chave_protecao_mfa',
    'chave_storage_id',
    'chave_storage_secreta',
    'codigos_recuperacao_administrador',
    'garage_admin',
    'garage_metricas',
    'garage_rpc',
    'redis_acl',
    'senha_administrador',
    'senha_postgresql',
    'totp_administrador',
    'url_postgresql',
    'url_redis',
  ]);

  for (const segredo of Object.values(compose.secrets)) {
    assert.match(segredo.file, /^\.\/\.segredos\/staging\//);
  }

  for (const servico of Object.values(compose.services)) {
    assert.equal(servico.env_file, undefined);
  }

  assert.ok(!conteudoCompose.includes('.segredos/producao'));
  assert.ok(!conteudoCompose.includes('.segredos/production'));
  assert.ok(!conteudoCompose.includes('POSTGRES_PASSWORD:'));
  assert.ok(!conteudoCompose.includes('GARAGE_RPC_SECRET:'));
  assert.ok(!conteudoCompose.includes('GARAGE_ADMIN_TOKEN:'));
  assert.equal(
    compose.services.storage.environment.GARAGE_RPC_SECRET_FILE,
    '/run/secrets/garage_rpc',
  );
  assert.match(codigoStaging, /DADOS_PERMITIDOS=sinteticos_ou_sanitizados/);
  assert.match(codigoStaging, /CHAVE_STORAGE_EXISTE_SEM_SEGREDO_LOCAL/);
  assert.match(codigoStaging, /vyntra\/api-staging:pr-097/);
  assert.match(codigoStaging, /no-new-privileges:true/);
  assert.match(codigoVerificacaoS3, /AWS4-HMAC-SHA256/);
  assert.ok(!codigoVerificacaoS3.includes('console.log(identificador'));
  assert.ok(!codigoVerificacaoS3.includes('console.log(segredo'));
});

test('entrega à API apenas contratos por arquivo e contexto explícito', () => {
  const ambiente = compose.services.api.environment;

  assert.equal(compose.services.api.user, '1000:0');
  assert.equal(ambiente.AMBIENTE_APLICACAO, 'staging');
  assert.equal(ambiente.ORIGENS_WEB_PERMITIDAS, 'https://omni.up100.com.br');
  assert.equal(ambiente.DADOS_PERMITIDOS, 'sinteticos_ou_sanitizados');
  assert.equal(ambiente.NODE_ENV, 'production');
  assert.equal(ambiente.BANCO_URL_FILE, '/run/secrets/url_postgresql');
  assert.equal(
    ambiente.AUTORIZACAO_OFFLINE_CHAVE_PRIVADA_FILE,
    '/run/secrets/chave_autorizacao_offline',
  );
  assert.equal(ambiente.AUTORIZACAO_OFFLINE_CHAVE_ID, 'staging-2026-09');
  assert.equal(
    ambiente.MFA_CHAVE_PROTECAO_FILE,
    '/run/secrets/chave_protecao_mfa',
  );
  assert.equal(ambiente.REDIS_URL_FILE, '/run/secrets/url_redis');
  assert.equal(ambiente.STORAGE_ENDPOINT, 'http://storage:3900');
  assert.equal(ambiente.STORAGE_BUCKET, 'vyntra-staging-midias');
  assert.equal(ambiente.STORAGE_CHAVE_ACESSO_FILE, '/run/secrets/chave_storage_id');
  assert.equal(
    ambiente.STORAGE_CHAVE_SECRETA_FILE,
    '/run/secrets/chave_storage_secreta',
  );
  assert.deepEqual([...compose.services.api.secrets].sort(), [
    'chave_autorizacao_offline',
    'chave_protecao_mfa',
    'chave_storage_id',
    'chave_storage_secreta',
    'url_postgresql',
    'url_redis',
  ]);
  assert.deepEqual(compose.services.migrar.secrets, ['url_postgresql']);
  assert.equal(compose.services.migrar.user, '1000:0');
  assert.deepEqual(compose.services.worker_fluxos.secrets, ['url_postgresql']);
  assert.deepEqual(compose.services.worker_fluxos.command, [
    'node',
    'dist/worker-fluxos.js',
  ]);
  assert.equal(compose.services.worker_fluxos.environment.REDIS_URL_FILE, undefined);
  assert.deepEqual(compose.services.provisionar_administrador.profiles, [
    'provisionamento',
  ]);
  assert.deepEqual(compose.services.provisionar_administrador.command, [
    'node',
    'dist/provisionar-administrador-staging.js',
  ]);
  assert.equal(compose.services.provisionar_administrador.read_only, true);
  assert.deepEqual(compose.services.provisionar_administrador.cap_drop, ['ALL']);
  assert.equal(
    compose.services.provisionar_administrador.environment.AMBIENTE_APLICACAO,
    'staging',
  );
});

test('ordena startup por saúde e limita privilégios e logs', () => {
  for (const nome of ['api', 'postgres', 'proxy', 'redis', 'storage', 'web']) {
    const servico = compose.services[nome];
    assert.ok(servico.healthcheck.test.length >= 2, nome);
    assert.ok(servico.security_opt.includes('no-new-privileges:true'), nome);
    assert.equal(servico.logging.driver, 'json-file', nome);
    assert.equal(servico.logging.options['max-file'], '5', nome);
    assert.equal(servico.logging.options['max-size'], '10m', nome);
  }

  assert.match(
    compose.services.api.healthcheck.test.at(-1),
    /\/api\/v1\/saude\/pronto/,
  );
  assert.match(
    compose.services.api.healthcheck.test.at(-1),
    /resposta\.status === 200/,
  );

  assert.equal(compose.services.api.depends_on.postgres.condition, 'service_healthy');
  assert.equal(compose.services.api.depends_on.redis.condition, 'service_healthy');
  assert.equal(compose.services.api.depends_on.storage.condition, 'service_healthy');
  assert.equal(
    compose.services.api.depends_on.migrar.condition,
    'service_completed_successfully',
  );
  assert.equal(
    compose.services.migrar.depends_on.postgres.condition,
    'service_healthy',
  );
  assert.equal(compose.services.api.pull_policy, 'build');
  assert.equal(
    compose.services.worker_fluxos.depends_on.postgres.condition,
    'service_healthy',
  );
  assert.equal(
    compose.services.worker_fluxos.depends_on.migrar.condition,
    'service_completed_successfully',
  );
  assert.equal(compose.services.worker_fluxos.pull_policy, 'build');
  assert.equal(compose.services.proxy.depends_on.api.condition, 'service_healthy');
  assert.equal(compose.services.proxy.depends_on.web.condition, 'service_healthy');
  assert.equal(compose.services.proxy.pull_policy, 'build');
  assert.equal(compose.services.web.pull_policy, 'build');
  assert.equal(compose.services.proxy.user, '1000:1000');
  assert.equal(compose.services.web.user, '1000:1000');
  assert.equal(compose.services.proxy.read_only, true);
  assert.equal(compose.services.web.read_only, true);
  assert.deepEqual(compose.services.proxy.cap_drop, ['ALL']);
  assert.deepEqual(compose.services.web.cap_drop, ['ALL']);
});

test('bootstrap do administrador exige MFA e mantém segredos fora do compose', () => {
  const provisionador = compose.services.provisionar_administrador;
  assert.deepEqual([...provisionador.secrets].sort(), [
    'chave_protecao_mfa',
    'codigos_recuperacao_administrador',
    'senha_administrador',
    'totp_administrador',
    'url_postgresql',
  ]);
  assert.equal(
    provisionador.environment.MFA_CHAVE_PROTECAO_FILE,
    '/run/secrets/chave_protecao_mfa',
  );
  assert.match(codigoStaging, /preparar-administrador/u);
  assert.match(codigoStaging, /nenhum valor foi exibido/u);
  assert.ok(!conteudoCompose.includes('ADMIN_SENHA:'));
  assert.ok(!conteudoCompose.includes('ADMIN_TOTP:'));
});

test('gera conjunto completo do administrador sem revelar ou sobrescrever', async () => {
  const raizTemporaria = await mkdtemp(join(tmpdir(), 'vyntra-staging-'));
  const diretorioSegredos = join(raizTemporaria, 'segredos');
  const diretorioAdministrador = join(diretorioSegredos, 'administrador');
  try {
    assert.equal(await prepararChaveProtecaoMfa(diretorioSegredos), true);
    assert.equal(await prepararChaveProtecaoMfa(diretorioSegredos), false);
    assert.equal(
      (await prepararAdministradorStaging(diretorioAdministrador)).length,
      3,
    );
    assert.deepEqual(
      await prepararAdministradorStaging(diretorioAdministrador),
      [],
    );
    assert.equal((await stat(diretorioAdministrador)).mode & 0o777, 0o700);
    const codigos = await readFile(
      join(diretorioAdministrador, 'codigos-recuperacao-administrador'),
      'utf8',
    );
    assert.equal(codigos.trimEnd().split('\n').length, 10);
    assert.equal(new Set(codigos.trimEnd().split('\n')).size, 10);
  } finally {
    await rm(raizTemporaria, { force: true, recursive: true });
  }
});

test('publica SPA e API na mesma origem com HTTPS e cabeçalhos defensivos', () => {
  assert.match(dockerfileWeb, /caddy:2\.11\.4-alpine@sha256:[0-9a-f]{64}/);
  assert.match(dockerfileWeb, /pnpm --filter '@vyntra\/web\.\.\.' install --frozen-lockfile/);
  assert.match(dockerfileWeb, /USER 1000:1000/g);
  assert.match(dockerfileWeb, /caddy-sem-capacidade/g);
  assert.match(dockerfileWeb, /ENTRYPOINT \["\/usr\/local\/bin\/caddy-sem-capacidade"\]/g);
  assert.match(configuracaoWeb, /http:\/\/:8080/);
  assert.match(configuracaoWeb, /try_files \{path\} \/index\.html/);
  assert.match(configuracaoWeb, /max-age=31536000, immutable/);
  assert.match(configuracaoBorda, /^omni\.up100\.com\.br \{$/m);
  assert.match(configuracaoBorda, /handle \/api\/\*/);
  assert.match(configuracaoBorda, /reverse_proxy api:3000/);
  assert.match(configuracaoBorda, /reverse_proxy web:8080/);
  assert.match(configuracaoBorda, /Strict-Transport-Security/);
  assert.match(configuracaoBorda, /Content-Security-Policy/);
  assert.match(configuracaoBorda, /X-Content-Type-Options "nosniff"/);
  assert.match(configuracaoBorda, /-X-Powered-By/);
  assert.match(codigoStaging, /https:\/\/omni\.up100\.com\.br/);
  assert.match(codigoStaging, /worker_fluxos=2/);
});
