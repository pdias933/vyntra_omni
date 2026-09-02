import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = resolve(raiz, 'compose.staging.yaml');
const projeto = 'vyntra-staging';
const release = process.env.VYNTRA_RELEASE;
const releaseAnterior = process.env.VYNTRA_RELEASE_ANTERIOR;
const comando = process.argv[2] ?? 'validar';
const PADRAO_RELEASE = /^[a-z0-9][a-z0-9._-]{2,63}$/u;

function exigirRelease(valor, codigo) {
  if (typeof valor !== 'string' || !PADRAO_RELEASE.test(valor)) {
    throw new Error(codigo);
  }
  return valor;
}

function ambienteDocker(alvo) {
  const ambiente = { ...process.env, DOCKER_BUILDKIT: '1', VYNTRA_RELEASE: alvo };
  for (const nome of ['COMPOSE_ENV_FILES', 'COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'DOCKER_CONTEXT', 'DOCKER_HOST']) delete ambiente[nome];
  return ambiente;
}

function docker(argumentos, alvo, capturar = false) {
  const resultado = spawnSync('docker', argumentos, {
    cwd: raiz,
    encoding: capturar ? 'utf8' : undefined,
    env: ambienteDocker(alvo),
    stdio: capturar ? 'pipe' : 'inherit',
  });
  if (resultado.error !== undefined || resultado.status !== 0) {
    throw new Error(`DEPLOY_DOCKER_FALHOU:${argumentos.at(-1) ?? 'comando'}`);
  }
  return resultado.stdout?.trim() ?? '';
}

function contextoLocal(alvo) {
  const contexto = docker(['context', 'show'], alvo, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(contexto)) {
    throw new Error('CONTEXTO_DOCKER_INVALIDO');
  }
  const endpoint = docker(['context', 'inspect', contexto, '--format', '{{.Endpoints.docker.Host}}'], alvo, true);
  if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
    throw new Error('CONTEXTO_DOCKER_REMOTO_NAO_AUTORIZADO');
  }
  return contexto;
}

function executarCompose(argumentos, alvo) {
  const contexto = contextoLocal(alvo);
  return docker(['--context', contexto, 'compose', '--file', compose, '--project-name', projeto, ...argumentos], alvo);
}

function confirmar(esperada) {
  if (process.env.VYNTRA_CONFIRMAR_DEPLOY !== esperada) {
    throw new Error(`CONFIRMACAO_DEPLOY_AUSENTE:${esperada}`);
  }
}

function validar(alvo) {
  const piloto = spawnSync(process.execPath, [resolve(raiz, 'scripts', 'piloto-controlado.mjs')], {
    cwd: raiz,
    encoding: 'utf8',
  });
  if (piloto.status !== 0) throw new Error('CONFIGURACAO_PILOTO_INVALIDA');
  executarCompose(['config', '--quiet'], alvo);
}

function ativarImagens(alvo) {
  executarCompose(['up', '--detach', '--no-build', '--no-deps', '--wait', '--scale', 'worker_fluxos=2', 'api', 'web', 'worker_fluxos'], alvo);
  executarCompose(['up', '--detach', '--no-build', '--no-deps', '--wait', 'proxy'], alvo);
  executarCompose(['exec', '--no-TTY', 'api', 'node', '-e', "fetch('http://127.0.0.1:3000/api/v1/saude/pronto').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], alvo);
}

function publicar(alvo, anterior) {
  confirmar(`PUBLICAR_${alvo}`);
  validar(alvo);
  executarCompose(['build', 'migrar', 'api', 'worker_fluxos', 'web', 'proxy'], alvo);
  executarCompose(['run', '--rm', '--no-deps', 'migrar'], alvo);
  try {
    ativarImagens(alvo);
  } catch (erro) {
    if (anterior !== undefined) ativarImagens(anterior);
    throw erro;
  }
}

const alvo = exigirRelease(release, 'VYNTRA_RELEASE_INVALIDA');
switch (comando) {
  case 'validar':
    validar(alvo);
    break;
  case 'publicar':
    publicar(
      alvo,
      releaseAnterior === undefined
        ? undefined
        : exigirRelease(releaseAnterior, 'VYNTRA_RELEASE_ANTERIOR_INVALIDA'),
    );
    break;
  case 'reverter': {
    const anterior = exigirRelease(
      releaseAnterior,
      'VYNTRA_RELEASE_ANTERIOR_INVALIDA',
    );
    confirmar(`REVERTER_${alvo}_PARA_${anterior}`);
    validar(anterior);
    ativarImagens(anterior);
    break;
  }
  default:
    throw new Error('COMANDO_DEPLOY_INVALIDO');
}
