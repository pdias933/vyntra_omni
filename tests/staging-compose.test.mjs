import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from 'yaml';

const conteudoCompose = await readFile('compose.staging.yaml', 'utf8');
const compose = parse(conteudoCompose);
const configuracaoStorage = await readFile('infra/staging/garage.toml', 'utf8');
const codigoStaging = await readFile('scripts/ambiente-staging.mjs', 'utf8');
const codigoVerificacaoS3 = await readFile(
  'scripts/verificar-storage-s3.mjs',
  'utf8',
);

test('declara somente a pilha mínima e persistente de staging', () => {
  assert.deepEqual(Object.keys(compose.services).sort(), [
    'api',
    'migrar',
    'postgres',
    'redis',
    'storage',
  ]);
  assert.deepEqual(Object.keys(compose.volumes).sort(), [
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
    assert.equal(servico.restart, nome === 'migrar' ? 'no' : 'unless-stopped');
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

  for (const nome of ['postgres', 'redis', 'storage']) {
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
});

test('separa todos os segredos e não aceita credencial de produção', () => {
  assert.deepEqual(Object.keys(compose.secrets).sort(), [
    'chave_storage_id',
    'chave_storage_secreta',
    'garage_admin',
    'garage_metricas',
    'garage_rpc',
    'redis_acl',
    'senha_postgresql',
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
  assert.match(codigoStaging, /vyntra\/api-staging:pr-025/);
  assert.match(codigoStaging, /no-new-privileges:true/);
  assert.match(codigoVerificacaoS3, /AWS4-HMAC-SHA256/);
  assert.ok(!codigoVerificacaoS3.includes('console.log(identificador'));
  assert.ok(!codigoVerificacaoS3.includes('console.log(segredo'));
});

test('entrega à API apenas contratos por arquivo e contexto explícito', () => {
  const ambiente = compose.services.api.environment;

  assert.equal(compose.services.api.user, '1000:0');
  assert.equal(ambiente.AMBIENTE_APLICACAO, 'staging');
  assert.equal(ambiente.ORIGENS_WEB_PERMITIDAS, 'https://staging.vyntra.local');
  assert.equal(ambiente.DADOS_PERMITIDOS, 'sinteticos_ou_sanitizados');
  assert.equal(ambiente.NODE_ENV, 'production');
  assert.equal(ambiente.BANCO_URL_FILE, '/run/secrets/url_postgresql');
  assert.equal(ambiente.REDIS_URL_FILE, '/run/secrets/url_redis');
  assert.equal(ambiente.STORAGE_ENDPOINT, 'http://storage:3900');
  assert.equal(ambiente.STORAGE_BUCKET, 'vyntra-staging-midias');
  assert.equal(ambiente.STORAGE_CHAVE_ACESSO_FILE, '/run/secrets/chave_storage_id');
  assert.equal(
    ambiente.STORAGE_CHAVE_SECRETA_FILE,
    '/run/secrets/chave_storage_secreta',
  );
  assert.deepEqual([...compose.services.api.secrets].sort(), [
    'chave_storage_id',
    'chave_storage_secreta',
    'url_postgresql',
    'url_redis',
  ]);
  assert.deepEqual(compose.services.migrar.secrets, ['url_postgresql']);
  assert.equal(compose.services.migrar.user, '1000:0');
});

test('ordena startup por saúde e limita privilégios e logs', () => {
  for (const nome of ['api', 'postgres', 'redis', 'storage']) {
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
});
