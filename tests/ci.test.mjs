import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from 'yaml';

const caminhoWorkflow = '.github/workflows/integracao-continua.yml';
const conteudoWorkflow = await readFile(caminhoWorkflow, 'utf8');
const workflow = parse(conteudoWorkflow);
const manifestoRaiz = JSON.parse(await readFile('package.json', 'utf8'));
const versaoNode = (await readFile('.node-version', 'utf8')).trim();
const configuracaoPnpm = parse(await readFile('pnpm-workspace.yaml', 'utf8'));
const verificadorSegredos = await readFile(
  'scripts/verificar-segredos.mjs',
  'utf8',
);
const configuracaoGitleaks = await readFile('.github/gitleaks.toml', 'utf8');
const excecoesGitleaks = await readFile('.github/gitleaksignore', 'utf8');

const actionsPermitidas = new Set([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
]);

function passosDosJobs() {
  return Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
}

function passoPorNome(job, nome) {
  const passos = workflow.jobs[job].steps.filter((passo) => passo.name === nome);
  assert.equal(passos.length, 1, `passo inválido: ${job}/${nome}`);
  return passos[0];
}

test('usa apenas eventos sem privilégio para código do pull request', () => {
  assert.equal(typeof workflow.on, 'object');
  assert.ok(workflow.on.pull_request !== undefined);
  assert.ok(workflow.on.push !== undefined);
  assert.ok(workflow.on.schedule !== undefined);
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.equal(workflow.on.workflow_run, undefined);
  assert.equal(workflow.on.issue_comment, undefined);
  assert.equal(workflow.on.repository_dispatch, undefined);
});

test('concede somente leitura e limita concorrência', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.concurrency?.['cancel-in-progress'], true);
  assert.equal(typeof workflow.concurrency?.group, 'string');
  assert.ok(workflow.concurrency.group.includes('github.event_name'));
});

test('fixa actions por SHA e não persiste credencial', () => {
  const passos = passosDosJobs();
  const actions = passos.filter((passo) => typeof passo.uses === 'string');

  assert.ok(actions.length > 0);

  for (const passo of actions) {
    assert.match(passo.uses, /^[^\s@]+@[0-9a-f]{40}$/);
    assert.ok(actionsPermitidas.has(passo.uses));
  }

  const checkouts = actions.filter((passo) =>
    passo.uses.startsWith('actions/checkout@'),
  );

  assert.equal(checkouts.length, 4);

  for (const checkout of checkouts) {
    assert.equal(checkout.with?.['persist-credentials'], false);
  }

  const setupsNode = actions.filter((passo) =>
    passo.uses.startsWith('actions/setup-node@'),
  );

  for (const setupNode of setupsNode) {
    assert.equal(setupNode.with?.['package-manager-cache'], false);
    assert.equal(setupNode.with?.['node-version-file'], '.node-version');
  }
});

test('mantém Node e pnpm exatos e verifica o binário do pnpm', () => {
  assert.equal(versaoNode, '24.20.0');
  assert.equal(manifestoRaiz.packageManager, 'pnpm@11.24.0');
  assert.equal(manifestoRaiz.engines?.pnpm, '11.24.0');
  assert.equal(workflow.env?.PNPM_VERSION, '11.24.0');
  assert.equal(
    workflow.env?.PNPM_SHA256,
    '0a9b76dedb5fe8cc5e7f3a9fd70854181cfb08a487ebaf0c9cfb044dc860936c',
  );
  assert.equal(configuracaoPnpm.strictDepBuilds, true);
  assert.equal(configuracaoPnpm.verifyDepsBeforeRun, 'error');

  const preparacoes = passosDosJobs().filter(
    (passo) => passo.name === 'Preparar pnpm com integridade verificada',
  );

  assert.equal(preparacoes.length, 2);

  for (const preparacao of preparacoes) {
    assert.ok(preparacao.run.includes('set -euo pipefail'));
    assert.ok(preparacao.run.includes('pnpm-linux-x64.tar.gz'));
    assert.ok(preparacao.run.includes('sha256sum --check --strict'));
    assert.ok(preparacao.run.includes('GITHUB_PATH'));
  }
});

test('mantém os portões obrigatórios e sem tolerar falha', () => {
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    'ambiente_local',
    'dependencias',
    'qualidade',
    'segredos',
  ]);

  const comandosObrigatorios = [
    ['qualidade', 'Instalar pelo lockfile', 'pnpm install --frozen-lockfile'],
    ['qualidade', 'Verificar matriz do Expo', 'pnpm verificar:expo'],
    ['qualidade', 'Verificar lint', 'pnpm lint'],
    ['qualidade', 'Verificar tipos', 'pnpm typecheck'],
    ['qualidade', 'Executar testes', 'pnpm test'],
    ['qualidade', 'Compilar aplicações', 'pnpm build'],
    [
      'dependencias',
      'Instalar parser sem executar scripts de dependências',
      'pnpm install --frozen-lockfile --ignore-scripts',
    ],
    [
      'dependencias',
      'Auditar árvore completa',
      'node scripts/verificar-dependencias.mjs',
    ],
  ];

  for (const [job, nome, comando] of comandosObrigatorios) {
    const passo = passoPorNome(job, nome);
    assert.equal(passo.run, comando);
    assert.equal(passo.if, undefined);
    assert.ok(
      passo['continue-on-error'] === undefined ||
        passo['continue-on-error'] === false,
    );
  }

  for (const job of ['qualidade', 'dependencias']) {
    const nomesEsperados = comandosObrigatorios
      .filter(([jobEsperado]) => jobEsperado === job)
      .map(([, nome]) => nome);
    const indices = nomesEsperados.map((nome) =>
      workflow.jobs[job].steps.findIndex((passo) => passo.name === nome),
    );

    assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  }

  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 20);
    assert.equal(job.environment, undefined);
    assert.equal(job.permissions, undefined);
    assert.equal(job.services, undefined);
    assert.equal(job.if, undefined);
    assert.equal(job['continue-on-error'], undefined);

    for (const passo of job.steps ?? []) {
      assert.ok(
        passo['continue-on-error'] === undefined ||
          passo['continue-on-error'] === false,
      );
    }
  }
});

test('sobe o ambiente local em projeto efêmero e comprova persistência', () => {
  const job = workflow.jobs.ambiente_local;
  const preparar = passoPorNome(
    'ambiente_local',
    'Gerar segredos locais sintéticos',
  );
  const validar = passoPorNome(
    'ambiente_local',
    'Validar configuração do Compose',
  );
  const smoke = passoPorNome(
    'ambiente_local',
    'Subir, testar persistência e remover ambiente efêmero',
  );

  assert.match(job.env.COMPOSE_PROJECT_NAME, /^vyntra-ci-/);
  assert.ok(job.env.COMPOSE_PROJECT_NAME.includes('github.run_id'));
  assert.ok(job.env.COMPOSE_PROJECT_NAME.includes('github.run_attempt'));
  assert.equal(preparar.run, 'node scripts/ambiente-local.mjs preparar');
  assert.equal(validar.run, 'node scripts/ambiente-local.mjs validar');
  assert.ok(smoke.run.includes('set -euo pipefail'));
  assert.ok(smoke.run.includes('trap limpar_ambiente EXIT'));
  assert.ok(smoke.run.includes('node scripts/ambiente-local.mjs subir'));
  assert.ok(smoke.run.includes('/api/v1/saude/pronto'));
  assert.ok(smoke.run.includes("test \"${codigo_http}\" = '200'"));
  assert.ok(smoke.run.includes('INSERT INTO registro_auditoria'));
  assert.ok(smoke.run.includes('UPDATE registro_auditoria'));
  assert.ok(smoke.run.includes('DELETE FROM registro_auditoria'));
  assert.ok(smoke.run.includes('TRUNCATE registro_auditoria'));
  assert.ok(smoke.run.includes('UPDATE de auditoria não foi bloqueado'));
  assert.ok(smoke.run.includes('INSERT INTO evento_dominio'));
  assert.ok(smoke.run.includes('INSERT INTO item_caixa_saida'));
  assert.ok(smoke.run.includes('Transação inválida de evento/caixa de saída não foi revertida'));
  assert.ok(smoke.run.includes('INSERT INTO registro_idempotencia'));
  assert.ok(smoke.run.includes('INSERT INTO operacao_recuperavel'));
  assert.ok(smoke.run.includes('Chave idempotente duplicada foi aceita'));
  assert.ok(smoke.run.includes('Estado ativo sem concessão foi aceito'));
  assert.ok(smoke.run.includes('docker compose restart postgres redis minio'));
  assert.ok(smoke.run.includes('docker compose up --wait --no-build'));
  assert.ok(smoke.run.includes('SELECT valor FROM verificacao_pr004'));
  assert.ok(smoke.run.includes('PGPASSWORD="$(cat /run/secrets/senha_postgresql)"'));
  assert.ok(smoke.run.includes('psql --host 127.0.0.1'));
  assert.ok(smoke.run.includes('--no-password'));
  assert.ok(smoke.run.includes('MC_HOST_local'));
  assert.ok(smoke.run.includes('mc ls local'));
  assert.ok(smoke.run.includes('local/verificacao-pr004/marcador'));
  assert.ok(smoke.run.includes('verificacao:pr004'));
  assert.ok(smoke.run.includes('down --volumes --remove-orphans'));
  assert.equal(smoke.run.match(/<\/dev\/null/g)?.length, 20);
  assert.ok(!smoke.run.includes('docker compose config'));
  assert.ok(!smoke.run.includes('docker compose logs'));
});

test('varre todo o histórico com Gitleaks verificado e saída ocultada', () => {
  const jobSegredos = workflow.jobs.segredos;
  const checkout = jobSegredos.steps.find((passo) =>
    passo.uses?.startsWith('actions/checkout@'),
  );
  const comando = jobSegredos.steps
    .map((passo) => passo.run)
    .find((run) => run?.includes('gitleaks'));

  assert.equal(checkout.with?.['fetch-depth'], 0);
  assert.equal(
    jobSegredos.steps.find((passo) => passo.run?.includes('gitleaks')).env
      ?.GITLEAKS_SHA256,
    '79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e',
  );
  assert.equal(
    jobSegredos.steps.find((passo) => passo.run?.includes('gitleaks')).env
      ?.GITLEAKS_VERSION,
    '8.30.0',
  );
  assert.ok(comando.includes('sha256sum --check --strict'));
  assert.ok(comando.includes('set -euo pipefail'));
  assert.ok(comando.includes('gitleaks" dir'));
  assert.ok(comando.includes('gitleaks" git'));
  assert.ok(comando.includes('.github/gitleaks.toml'));
  assert.ok(comando.includes('.github/gitleaksignore'));
  assert.ok(comando.includes('--ignore-gitleaks-allow'));
  assert.ok(comando.includes('não rejeitou corretamente o canário sintético'));
  assert.ok(comando.includes('GITHUB_WORKSPACE'));
  assert.ok(verificadorSegredos.includes("const versaoEsperada = '8.30.0'"));
  assert.ok(verificadorSegredos.includes("'gitleaks.toml'"));
  assert.ok(verificadorSegredos.includes("'gitleaksignore'"));
  assert.ok(verificadorSegredos.includes("'--ignore-gitleaks-allow'"));
  assert.ok(verificadorSegredos.includes('canario.status !== 1'));
  assert.match(configuracaoGitleaks, /minVersion = "8\.30\.0"/);
  assert.match(configuracaoGitleaks, /useDefault = true/);
  assert.deepEqual(
    excecoesGitleaks
      .split(/\r?\n/)
      .filter((linha) => linha.trim() !== '' && !linha.startsWith('#')),
    [],
  );
});

test('audita ferramentas de desenvolvimento e usa o registro oficial', async () => {
  const verificador = await readFile(
    'scripts/verificar-dependencias.mjs',
    'utf8',
  );

  assert.ok(verificador.includes("['audit', '--json']"));
  assert.ok(!verificador.includes("'--prod'"));
  assert.equal(
    workflow.env?.NPM_CONFIG_REGISTRY,
    'https://registry.npmjs.org/',
  );
  assert.equal(
    passoPorNome('dependencias', 'Auditar árvore completa').env
      ?.PNPM_EXECUTAVEL,
    'pnpm',
  );
});

test('não injeta contexto não confiável, segredo ou runner próprio', () => {
  assert.ok(!conteudoWorkflow.includes('secrets.'));
  assert.ok(!conteudoWorkflow.includes('self-hosted'));
  assert.ok(!conteudoWorkflow.includes('pull_request_target'));

  for (const passo of passosDosJobs()) {
    if (typeof passo.run === 'string') {
      assert.ok(!passo.run.includes('${{ github.event.'));

      for (const escape of [
        '|| true',
        '|| exit 0',
        '; true',
        'set +e',
        '--ignore-registry-errors',
        '--exit-code 0',
      ]) {
        assert.ok(!passo.run.includes(escape));
      }
    }
  }
});
