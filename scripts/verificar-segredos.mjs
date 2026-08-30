import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const versaoEsperada = '8.30.0';
const raizRepositorio = process.cwd();
const argumentosProtegidos = [
  '--config',
  join(raizRepositorio, '.github', 'gitleaks.toml'),
  '--gitleaks-ignore-path',
  join(raizRepositorio, '.github', 'gitleaksignore'),
  '--ignore-gitleaks-allow',
  '--redact',
  '--no-banner',
];

function executar(argumentos, opcoes = {}) {
  return spawnSync('gitleaks', argumentos, {
    cwd: raizRepositorio,
    encoding: opcoes.capturar ? 'utf8' : undefined,
    input: opcoes.entrada,
    stdio: opcoes.capturar ? 'pipe' : 'inherit',
  });
}

const versao = executar(['version'], { capturar: true });

if (versao.error !== undefined) {
  console.error(`GITLEAKS_${versaoEsperada.replaceAll('.', '_')}_NAO_DISPONIVEL`);
  process.exitCode = 1;
} else if (
  versao.status !== 0 ||
  !new RegExp(`\\b${versaoEsperada.replaceAll('.', '\\.')}\\b`).test(
    `${versao.stdout ?? ''}${versao.stderr ?? ''}`,
  )
) {
  console.error(`GITLEAKS_VERSAO_INCOMPATIVEL; esperado ${versaoEsperada}`);
  process.exitCode = 1;
} else {
  const canario = executar(['stdin', ...argumentosProtegidos], {
    capturar: true,
    entrada: `token = "ghp_${'Y7qP9mK2vR8sT4wX6z'}${'A3bC5dE1fG0hJ4nL8M'}"\n`,
  });

  if (canario.error !== undefined || canario.status !== 1) {
    console.error('GITLEAKS_CANARIO_NAO_DETECTADO');
    process.exitCode = 1;
  }

  const verificacoes = [
    ['git', ...argumentosProtegidos, raizRepositorio],
    ['git', '--staged', ...argumentosProtegidos, raizRepositorio],
    ['git', '--pre-commit', ...argumentosProtegidos, raizRepositorio],
  ];

  for (const argumentos of process.exitCode === 1 ? [] : verificacoes) {
    const resultado = executar(argumentos);

    if (resultado.error !== undefined) {
      throw resultado.error;
    }

    if (resultado.status !== 0) {
      process.exitCode = resultado.status ?? 1;
      break;
    }
  }
}
