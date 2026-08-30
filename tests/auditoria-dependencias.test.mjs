import assert from 'node:assert/strict';
import test from 'node:test';

import { avaliarRelatorioAuditoria } from '../scripts/auditoria-dependencias.mjs';

const configuracaoBase = {
  excecoes: [
    {
      id: 'GHSA-w5hq-g745-h8pq',
      pacote: 'uuid',
      severidade: 'moderate',
      versoes: ['7.0.3'],
      raiz_caminho: 'apps__mobile',
      entradas_caminho: ['expo', 'expo-dev-client'],
      segmentos_caminho_permitidos: [
        'apps__mobile',
        'expo',
        'expo-dev-client',
        '@expo/config-plugins',
        'xcode',
        'uuid',
      ],
      sufixo_caminho: ['@expo/config-plugins', 'xcode', 'uuid'],
      ancestral_lockfile: {
        chave: 'xcode@3.0.1',
        dependencia: 'uuid',
        versao_dependencia: '7.0.3',
      },
      dependencia_desenvolvimento: false,
      dependencia_opcional: false,
      expira_em: '2026-09-29',
      documento: 'docs/dependencias/PR-002.md',
    },
  ],
};

const lockfileBase = {
  packages: {
    'uuid@7.0.3': {
      resolution: { integrity: 'sha512-uuid' },
    },
    'xcode@3.0.1': {
      resolution: { integrity: 'sha512-xcode' },
    },
  },
  snapshots: {
    'uuid@7.0.3': {},
    'xcode@3.0.1': {
      dependencies: { uuid: '7.0.3' },
    },
  },
};

const relatorioBase = {
  advisories: {
    '1119441': {
      findings: [
        {
          version: '7.0.3',
          paths: ['apps__mobile>expo>@expo/config-plugins>xcode>uuid'],
          dev: false,
          optional: false,
        },
      ],
      github_advisory_id: 'GHSA-w5hq-g745-h8pq',
      module_name: 'uuid',
      severity: 'moderate',
    },
  },
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 1,
      high: 0,
      critical: 0,
    },
  },
};

function avaliar(
  relatorio,
  configuracao = configuracaoBase,
  dataAtual = '2026-08-29',
  lockfile = lockfileBase,
) {
  return avaliarRelatorioAuditoria({
    configuracao,
    dataAtual,
    lockfile,
    relatorio,
  });
}

test('aceita somente a exceção conhecida no escopo aprovado', () => {
  assert.deepEqual(avaliar(relatorioBase), {
    avisosPermitidos: ['GHSA-w5hq-g745-h8pq'],
  });
});

test('bloqueia qualquer vulnerabilidade nova, inclusive moderada', () => {
  const relatorio = structuredClone(relatorioBase);
  relatorio.advisories['1119441'].github_advisory_id =
    'GHSA-nova-vulnerabilidade';

  assert.throws(
    () => avaliar(relatorio),
    /VULNERABILIDADE_NAO_PERMITIDA/,
  );
});

test('bloqueia vulnerabilidade alta mesmo com a mesma árvore', () => {
  const relatorio = structuredClone(relatorioBase);
  relatorio.advisories['1119441'].severity = 'high';
  relatorio.metadata.vulnerabilities.moderate = 0;
  relatorio.metadata.vulnerabilities.high = 1;

  assert.throws(
    () => avaliar(relatorio),
    /VULNERABILIDADE_MUDOU_DE_ESCOPO/,
  );
});

test('bloqueia a exceção quando o caminho recebe ancestral não aprovado', () => {
  const relatorio = structuredClone(relatorioBase);
  relatorio.advisories['1119441'].findings[0].paths = [
    'apps__mobile>outra-dependencia>@expo/config-plugins>xcode>uuid',
  ];

  assert.throws(
    () => avaliar(relatorio),
    /VULNERABILIDADE_MUDOU_DE_ESCOPO/,
  );
});

test('bloqueia a exceção quando a versão do xcode ou sua ligação mudam', () => {
  const lockfile = structuredClone(lockfileBase);
  lockfile.snapshots['xcode@3.0.1'].dependencies.uuid = '8.0.0';

  assert.throws(
    () => avaliar(relatorioBase, configuracaoBase, '2026-08-29', lockfile),
    /VULNERABILIDADE_MUDOU_DE_ESCOPO/,
  );
});

test('bloqueia a exceção depois da data limite', () => {
  assert.throws(
    () => avaliar(relatorioBase, configuracaoBase, '2026-09-30'),
    /EXCECAO_AUDITORIA_EXPIRADA/,
  );
});

test('exige remover a exceção quando o achado desaparecer', () => {
  const relatorio = {
    advisories: {},
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
      },
    },
  };

  assert.throws(
    () => avaliar(relatorio),
    /EXCECAO_AUDITORIA_SEM_ACHADO/,
  );
});

test('recusa relatório cuja contagem não fecha', () => {
  const relatorio = structuredClone(relatorioBase);
  relatorio.metadata.vulnerabilities.moderate = 0;

  assert.throws(
    () => avaliar(relatorio),
    /RELATORIO_AUDITORIA_INVALIDO/,
  );
});
