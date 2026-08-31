import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const caminhoScript = fileURLToPath(import.meta.url);
const raizRepositorio = resolve(dirname(caminhoScript), '..');
const diretorioSegredosPadrao = join(
  raizRepositorio,
  '.segredos',
  'desenvolvimento',
);
const caminhoCompose = join(raizRepositorio, 'compose.yaml');
const nomeProjetoPadrao = 'vyntra-desenvolvimento';

function gerarValorAleatorio() {
  return randomBytes(32).toString('base64url');
}

const arquivosSegredos = Object.freeze([
  {
    nome: 'senha-postgresql',
    modo: 0o640,
    gerar: () => `${gerarValorAleatorio()}\n`,
    validar: (conteudo) => /^[A-Za-z0-9_-]{43}\n$/.test(conteudo),
  },
  {
    nome: 'usuario-minio',
    modo: 0o644,
    gerar: () => `vyntra${randomBytes(7).toString('hex')}\n`,
    validar: (conteudo) => /^vyntra[a-f0-9]{14}\n$/.test(conteudo),
  },
  {
    nome: 'senha-minio',
    modo: 0o644,
    gerar: () => `${gerarValorAleatorio()}\n`,
    validar: (conteudo) => /^[A-Za-z0-9_-]{43}\n$/.test(conteudo),
  },
  {
    nome: 'redis.acl',
    modo: 0o644,
    gerar: () =>
      `user default off\nuser vyntra on >${gerarValorAleatorio()} ~* &* +@all\n`,
    validar: (conteudo) =>
      /^user default off\nuser vyntra on >[A-Za-z0-9_-]{43} ~\* &\* \+@all\n$/.test(
        conteudo,
      ),
  },
]);

function obterCodigoErro(erro) {
  if (typeof erro !== 'object' || erro === null || !('code' in erro)) {
    return undefined;
  }

  return erro.code;
}

async function validarDiretorio(diretorio) {
  const estado = await lstat(diretorio);

  if (!estado.isDirectory() || estado.isSymbolicLink()) {
    throw new Error('DIRETORIO_SEGREDOS_INVALIDO');
  }

  if (process.platform !== 'win32' && (estado.mode & 0o077) !== 0) {
    throw new Error('PERMISSAO_DIRETORIO_SEGREDOS_INSEGURA');
  }
}

async function caminhoExiste(caminho) {
  try {
    await lstat(caminho);
    return true;
  } catch (erro) {
    if (obterCodigoErro(erro) === 'ENOENT') {
      return false;
    }

    throw erro;
  }
}

async function validarArquivo(caminho, definicao) {
  const estado = await lstat(caminho);

  if (!estado.isFile() || estado.isSymbolicLink()) {
    throw new Error(`ARQUIVO_SEGREDO_INVALIDO:${definicao.nome}`);
  }

  if (
    process.platform !== 'win32' &&
    (estado.mode & 0o777) !== definicao.modo
  ) {
    throw new Error(`PERMISSAO_SEGREDO_INCORRETA:${definicao.nome}`);
  }

  const conteudo = await readFile(caminho, 'utf8');

  if (!definicao.validar(conteudo)) {
    throw new Error(`CONTEUDO_SEGREDO_INVALIDO:${definicao.nome}`);
  }
}

async function criarArquivoSeAusente(caminho, definicao) {
  let arquivo;

  try {
    arquivo = await open(caminho, 'wx', definicao.modo);
  } catch (erro) {
    if (obterCodigoErro(erro) !== 'EEXIST') {
      throw erro;
    }

    await validarArquivo(caminho, definicao);
    return false;
  }

  try {
    await arquivo.writeFile(definicao.gerar(), 'utf8');
  } finally {
    await arquivo.close();
  }

  if (process.platform !== 'win32') {
    await chmod(caminho, definicao.modo);
  }

  await validarArquivo(caminho, definicao);
  return true;
}

async function prepararSegredos(diretorio = diretorioSegredosPadrao) {
  await mkdir(diretorio, { mode: 0o700, recursive: true });
  await validarDiretorio(diretorio);

  const presencas = await Promise.all(
    arquivosSegredos.map(({ nome }) => caminhoExiste(join(diretorio, nome))),
  );
  const quantidadeExistente = presencas.filter(Boolean).length;

  if (
    quantidadeExistente !== 0 &&
    quantidadeExistente !== arquivosSegredos.length
  ) {
    throw new Error('CONJUNTO_SEGREDOS_INCOMPLETO');
  }

  const criados = [];

  for (const definicao of arquivosSegredos) {
    const caminho = join(diretorio, definicao.nome);

    if (await criarArquivoSeAusente(caminho, definicao)) {
      criados.push(definicao.nome);
    }
  }

  return criados;
}

async function validarSegredos(diretorio = diretorioSegredosPadrao) {
  await validarDiretorio(diretorio);

  for (const definicao of arquivosSegredos) {
    await validarArquivo(join(diretorio, definicao.nome), definicao);
  }
}

function executarDocker(
  argumentos,
  ambiente,
  { capturar = false, codigoErro = 'DOCKER_FALHOU', rotulo } = {},
) {
  const resultado = spawnSync('docker', argumentos, {
    cwd: raizRepositorio,
    encoding: capturar ? 'utf8' : undefined,
    env: ambiente,
    stdio: capturar ? 'pipe' : 'inherit',
  });

  if (resultado.error !== undefined) {
    if (obterCodigoErro(resultado.error) === 'ENOENT') {
      throw new Error('DOCKER_COMPOSE_NAO_DISPONIVEL');
    }

    throw resultado.error;
  }

  if (resultado.status !== 0) {
    throw new Error(`${codigoErro}:${rotulo ?? argumentos[0] ?? 'comando'}`);
  }

  return resultado;
}

function endpointDockerEhLocal(endpoint) {
  return endpoint.startsWith('unix://') || endpoint.startsWith('npipe://');
}

function obterContextoDockerLocal(ambiente) {
  const nome = executarDocker(['context', 'show'], ambiente, {
    capturar: true,
  }).stdout.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(nome)) {
    throw new Error('CONTEXTO_DOCKER_INVALIDO');
  }

  const endpoint = executarDocker(
    [
      'context',
      'inspect',
      nome,
      '--format',
      '{{.Endpoints.docker.Host}}',
    ],
    ambiente,
    { capturar: true },
  ).stdout.trim();

  if (!endpointDockerEhLocal(endpoint)) {
    throw new Error('CONTEXTO_DOCKER_REMOTO_BLOQUEADO');
  }

  return nome;
}

function executarDockerCompose(argumentos, { capturar = false } = {}) {
  const nomeProjeto = process.env.COMPOSE_PROJECT_NAME ?? nomeProjetoPadrao;

  if (!/^vyntra-(?:desenvolvimento|ci-[0-9]+-[0-9]+)$/.test(nomeProjeto)) {
    throw new Error('NOME_PROJETO_COMPOSE_INVALIDO');
  }

  const ambiente = {
    ...process.env,
    DOCKER_BUILDKIT: '1',
  };

  for (const variavel of [
    'COMPOSE_ENV_FILES',
    'COMPOSE_FILE',
    'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
  ]) {
    delete ambiente[variavel];
  }

  const contexto = obterContextoDockerLocal(ambiente);

  const argumentosDocker = [
    '--context',
    contexto,
    'compose',
    '--file',
    caminhoCompose,
    '--project-name',
    nomeProjeto,
    ...argumentos,
  ];
  return executarDocker(argumentosDocker, ambiente, {
    capturar,
    codigoErro: 'DOCKER_COMPOSE_FALHOU',
    rotulo: argumentos[0] ?? 'comando',
  });
}

async function validarAmbiente() {
  await validarSegredos();
  executarDockerCompose(['version'], { capturar: true });
  executarDockerCompose(['config', '--quiet']);
}

async function executarComando(comando) {
  switch (comando) {
    case 'preparar': {
      const criados = await prepararSegredos();
      const resumo = criados.length === 0 ? 'já estavam prontos' : 'foram criados';
      console.log(`Segredos locais ${resumo}; nenhum valor foi exibido.`);
      break;
    }
    case 'validar':
      await validarAmbiente();
      console.log('Configuração local válida.');
      break;
    case 'subir':
      await prepararSegredos();
      await validarAmbiente();
      executarDockerCompose(['up', '--build', '--wait']);
      console.log('Ambiente local saudável.');
      break;
    case 'parar':
      executarDockerCompose(['down']);
      console.log('Ambiente local parado; volumes preservados.');
      break;
    case 'estado':
      executarDockerCompose(['ps']);
      break;
    default:
      throw new Error(
        'COMANDO_INVALIDO; use preparar, validar, subir, estado ou parar',
      );
  }
}

const executadoDiretamente =
  process.argv[1] !== undefined && resolve(process.argv[1]) === caminhoScript;

if (executadoDiretamente) {
  try {
    await executarComando(process.argv[2]);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'ERRO_DESCONHECIDO';
    console.error(`Ambiente local bloqueado: ${mensagem}`);
    process.exitCode = 1;
  }
}

export {
  arquivosSegredos,
  diretorioSegredosPadrao,
  endpointDockerEhLocal,
  prepararSegredos,
  validarSegredos,
};
