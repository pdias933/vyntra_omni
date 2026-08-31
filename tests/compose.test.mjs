import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from 'yaml';

const conteudoCompose = await readFile('compose.yaml', 'utf8');
const compose = parse(conteudoCompose);
const dockerfileApi = await readFile('apps/api/Dockerfile', 'utf8');
const dockerignore = await readFile('.dockerignore', 'utf8');
const codeowners = await readFile('.github/CODEOWNERS', 'utf8');
const configuracaoExemplo = await readFile('.env.example', 'utf8');
const entradaApi = await readFile('apps/api/src/main.ts', 'utf8');

const imagensExternas = Object.entries(compose.services)
  .filter(
    ([, servico]) =>
      typeof servico.image === 'string' && servico.build === undefined,
  )
  .map(([nome, servico]) => [nome, servico.image]);

test('declara somente a pilha local e o inicializador limitado do MinIO', () => {
  assert.deepEqual(Object.keys(compose.services).sort(), [
    'api',
    'minio',
    'postgres',
    'preparar_volume_minio',
    'redis',
  ]);
  assert.deepEqual(Object.keys(compose.volumes).sort(), [
    'dados_minio',
    'dados_postgresql',
    'dados_redis',
  ]);
  assert.equal(compose.version, undefined);
  assert.equal(compose.services.preparar_volume_minio.network_mode, 'none');
  assert.equal(compose.services.api.pull_policy, 'build');
  assert.equal(
    compose.services.minio.depends_on.preparar_volume_minio.condition,
    'service_completed_successfully',
  );
});

test('fixa imagens externas por versão e digest multiarch conhecido', () => {
  const esperadas = new Map([
    [
      'postgres',
      'docker.io/library/postgres:18.6-alpine3.23@sha256:697c180dbf244d3ce4a8f4cbc0156cde840af055c1bf8b76aebe422a4822086f',
    ],
    [
      'redis',
      'docker.io/library/redis:7.2.16-alpine3.21@sha256:ccd6aa8d45ff3f033d6fa15b8cc1a50579f65c89f38cf9bb607a954c4f2128ed',
    ],
    [
      'minio',
      'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e',
    ],
    [
      'preparar_volume_minio',
      'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e',
    ],
  ]);

  assert.deepEqual(new Map(imagensExternas), esperadas);

  for (const [, imagem] of imagensExternas) {
    assert.match(imagem, /:[^@]+@sha256:[0-9a-f]{64}$/);
    assert.ok(!imagem.includes(':latest'));
  }

  assert.match(
    dockerfileApi,
    /node:24\.20\.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e/,
  );
  assert.match(
    dockerfileApi,
    /ADD --checksum=sha256:d1eab2433172661cc36a18ec85fce93f771db1962717329cc01ec9c2824ca24f/,
  );
  assert.match(dockerfileApi, /pnpm-11\.24\.0\.tgz/);
  assert.match(dockerfileApi, /install --frozen-lockfile/);
  assert.match(dockerfileApi, /deploy --prod --legacy/);
  assert.match(
    dockerfileApi,
    /^# syntax=docker\/dockerfile:1\.7\.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e$/m,
  );
});

test('isola dados e usa bridge própria para publicar somente em loopback', () => {
  assert.equal(compose.networks.rede_dados.internal, true);
  assert.equal(compose.networks.rede_publicada_local.internal, false);
  assert.equal(compose.services.postgres.ports, undefined);
  assert.equal(compose.services.redis.ports, undefined);

  for (const nome of ['api', 'minio']) {
    const portas = compose.services[nome].ports;
    assert.ok(portas.length > 0);

    for (const porta of portas) {
      assert.equal(porta.host_ip, '127.0.0.1');
      assert.equal(porta.protocol, 'tcp');
    }
  }

  assert.deepEqual(compose.services.postgres.networks, ['rede_dados']);
  assert.deepEqual(compose.services.redis.networks, ['rede_dados']);
  assert.deepEqual(compose.services.minio.networks, ['rede_publicada_local']);
  assert.deepEqual(compose.services.api.networks, [
    'rede_dados',
    'rede_publicada_local',
  ]);
});

test('usa arquivos secretos locais sem senha funcional versionada', () => {
  assert.deepEqual(Object.keys(compose.secrets).sort(), [
    'redis_acl',
    'senha_minio',
    'senha_postgresql',
    'usuario_minio',
  ]);

  for (const segredo of Object.values(compose.secrets)) {
    assert.match(segredo.file, /^\.\/\.segredos\/desenvolvimento\//);
  }

  assert.equal(compose.services.postgres.environment.POSTGRES_PASSWORD, undefined);
  assert.equal(
    compose.services.postgres.environment.POSTGRES_PASSWORD_FILE,
    '/run/secrets/senha_postgresql',
  );
  assert.equal(
    compose.services.minio.environment.MINIO_ROOT_PASSWORD_FILE,
    '/run/secrets/senha_minio',
  );
  assert.equal(compose.services.redis.environment, undefined);
  assert.ok(!conteudoCompose.includes('minioadmin'));
  assert.ok(!conteudoCompose.includes('POSTGRES_HOST_AUTH_METHOD'));
  assert.ok(!configuracaoExemplo.toLowerCase().includes('senha='));
  assert.match(codeowners, /^\/\.gitignore @pdias933$/m);
});

test('ordena o startup por saúde sem antecipar endpoints da PR 007', () => {
  for (const nome of ['api', 'minio', 'postgres', 'redis']) {
    const healthcheck = compose.services[nome].healthcheck;
    assert.ok(healthcheck.test.length >= 2);
    assert.match(healthcheck.interval, /^\d+s$/);
    assert.match(healthcheck.timeout, /^\d+s$/);
    assert.ok(healthcheck.retries >= 3);
    assert.match(healthcheck.start_period, /^\d+s$/);
  }

  assert.equal(compose.services.api.depends_on.postgres.condition, 'service_healthy');
  assert.equal(compose.services.api.depends_on.redis.condition, 'service_healthy');
  assert.equal(compose.services.api.depends_on.minio.condition, 'service_healthy');
  assert.ok(
    compose.services.minio.healthcheck.test.includes(
      'http://127.0.0.1:9000/minio/health/ready',
    ),
  );
  assert.match(
    compose.services.api.healthcheck.test.at(-1),
    /resposta\.status === 404/,
  );
  assert.match(
    compose.services.postgres.healthcheck.test.at(-1),
    /--host 127\.0\.0\.1/,
  );
  assert.ok(!conteudoCompose.includes('/saude/'));
});

test('remove privilégios amplos e limita logs e montagens', () => {
  for (const [nome, servico] of Object.entries(compose.services)) {
    assert.equal(servico.privileged, undefined, nome);
    assert.equal(servico.container_name, undefined, nome);
    assert.equal(servico.pid, undefined, nome);
    assert.equal(servico.ipc, undefined, nome);
    assert.equal(servico.cap_add, undefined, nome);
    assert.equal(servico.logging.driver, 'json-file', nome);
    assert.equal(servico.logging.options['max-file'], '3', nome);
    assert.equal(servico.logging.options['max-size'], '10m', nome);
    assert.ok(
      servico.security_opt.includes('no-new-privileges:true'),
      nome,
    );

    for (const volume of servico.volumes ?? []) {
      assert.equal(typeof volume, 'string');
      const origem = volume.split(':', 1)[0];
      assert.ok(Object.hasOwn(compose.volumes, origem), `${nome}:${origem}`);
      assert.ok(!volume.includes('/var/run/docker.sock'));
    }
  }

  for (const nome of ['api', 'minio', 'preparar_volume_minio']) {
    assert.deepEqual(compose.services[nome].cap_drop, ['ALL']);
    assert.equal(compose.services[nome].read_only, true);
  }

  assert.equal(compose.services.minio.user, '1000:0');
  assert.match(dockerfileApi, /USER 1000:1000/);
  assert.match(dockerfileApi, /COPY --from=construtor --chown=node:node/);
});

test('não envia segredos, histórico ou outras aplicações ao build da API', () => {
  const entradasDockerignore = dockerignore.split(/\r?\n/);

  assert.equal(entradasDockerignore.at(0), '**');

  for (const entrada of [
    '!package.json',
    '!pnpm-lock.yaml',
    '!pnpm-workspace.yaml',
    '!tsconfig.json',
    '!apps/api/package.json',
    '!apps/api/tsconfig.json',
    '!apps/api/tsconfig.build.json',
    '!apps/api/src/**/*.ts',
    '!packages/eslint-config/package.json',
    '!packages/typescript-config/package.json',
    '!packages/typescript-config/base.json',
    '!packages/typescript-config/nest.json',
    '**/.env',
    '**/.env.*',
    '**/.npmrc',
    '**/.pnpmrc',
    '**/*.key',
    '**/*.pem',
  ]) {
    assert.ok(entradasDockerignore.includes(entrada), entrada);
  }

  assert.ok(!entradasDockerignore.includes('!apps/api/**'));
  assert.ok(!dockerfileApi.includes('COPY . .'));
  assert.ok(!dockerfileApi.includes('ARG SENHA'));
  assert.ok(!dockerfileApi.includes('ENV SENHA'));
});

test('mantém bind local por padrão e permite bind interno apenas no Compose', () => {
  assert.match(entradaApi, /process\.env\.ENDERECO_HTTP \?\? '127\.0\.0\.1'/);
  assert.equal(compose.services.api.environment.ENDERECO_HTTP, '0.0.0.0');
  assert.equal(compose.services.api.environment.PORTA_HTTP, '3000');
  assert.match(entradaApi, /PORTA_HTTP_INVALIDA/);
});
