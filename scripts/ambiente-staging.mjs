import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rm,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const caminhoScript = fileURLToPath(import.meta.url);
const raizRepositorio = resolve(dirname(caminhoScript), '..');
const diretorioSegredosPadrao = join(raizRepositorio, '.segredos', 'staging');
const caminhoCompose = join(raizRepositorio, 'compose.staging.yaml');
const nomeProjeto = 'vyntra-staging';
const nomeChaveStorage = 'vyntra-staging-aplicacao';
const nomeBucketStorage = 'vyntra-staging-midias';
const confirmacaoObrigatoria = 'STAGING_ISOLADO_SEM_DADOS_DE_PRODUCAO';

function gerarValorAleatorio() {
  return randomBytes(32).toString('base64url');
}

const arquivosSegredosBase = Object.freeze([
  {
    nome: 'marcador-ambiente',
    modo: 0o600,
    validar: (conteudo) =>
      conteudo ===
      'VYNTRA_AMBIENTE=staging\nDADOS_PERMITIDOS=sinteticos_ou_sanitizados\n',
  },
  {
    nome: 'senha-postgresql',
    modo: 0o600,
    validar: (conteudo) => /^[A-Za-z0-9_-]{43}\n$/.test(conteudo),
  },
  {
    nome: 'url-postgresql',
    modo: 0o600,
    validar: (conteudo) =>
      /^postgresql:\/\/vyntra_staging:[A-Za-z0-9_-]{43}@postgres:5432\/vyntra_staging\?schema=public\n$/.test(
        conteudo,
      ),
  },
  {
    nome: 'redis.acl',
    modo: 0o644,
    validar: (conteudo) =>
      /^user default off\nuser vyntra_staging on >[A-Za-z0-9_-]{43} ~\* &\* \+@all\n$/.test(
        conteudo,
      ),
  },
  {
    nome: 'url-redis',
    modo: 0o600,
    validar: (conteudo) =>
      /^redis:\/\/vyntra_staging:[A-Za-z0-9_-]{43}@redis:6379\/0\n$/.test(
        conteudo,
      ),
  },
  {
    nome: 'garage-rpc',
    modo: 0o600,
    validar: (conteudo) => /^[a-f0-9]{64}\n$/.test(conteudo),
  },
  {
    nome: 'garage-admin',
    modo: 0o600,
    validar: (conteudo) => /^[A-Za-z0-9_-]{43}\n$/.test(conteudo),
  },
  {
    nome: 'garage-metricas',
    modo: 0o600,
    validar: (conteudo) => /^[A-Za-z0-9_-]{43}\n$/.test(conteudo),
  },
]);

const arquivosCredencialStorage = Object.freeze([
  {
    nome: 'chave-storage-id',
    modo: 0o600,
    validar: (conteudo) => /^GK[A-Za-z0-9]{32,64}\n$/.test(conteudo),
  },
  {
    nome: 'chave-storage-secreta',
    modo: 0o600,
    validar: (conteudo) => /^[a-f0-9]{64}\n$/.test(conteudo),
  },
]);

function obterCodigoErro(erro) {
  if (typeof erro !== 'object' || erro === null || !('code' in erro)) {
    return undefined;
  }

  return erro.code;
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

async function validarDiretorio(diretorio) {
  const estado = await lstat(diretorio);

  if (!estado.isDirectory() || estado.isSymbolicLink()) {
    throw new Error('DIRETORIO_SEGREDOS_STAGING_INVALIDO');
  }

  if (process.platform !== 'win32' && (estado.mode & 0o077) !== 0) {
    throw new Error('PERMISSAO_DIRETORIO_STAGING_INSEGURA');
  }
}

async function validarArquivo(diretorio, definicao) {
  const caminho = join(diretorio, definicao.nome);
  const estado = await lstat(caminho);

  if (!estado.isFile() || estado.isSymbolicLink()) {
    throw new Error(`ARQUIVO_SEGREDO_STAGING_INVALIDO:${definicao.nome}`);
  }

  if (process.platform !== 'win32' && (estado.mode & 0o777) !== definicao.modo) {
    throw new Error(`PERMISSAO_SEGREDO_STAGING_INCORRETA:${definicao.nome}`);
  }

  const conteudo = await readFile(caminho, 'utf8');

  if (!definicao.validar(conteudo)) {
    throw new Error(`CONTEUDO_SEGREDO_STAGING_INVALIDO:${definicao.nome}`);
  }

  return conteudo;
}

async function criarArquivoExclusivo(caminho, conteudo, modo) {
  const arquivo = await open(caminho, 'wx', modo);

  try {
    await arquivo.writeFile(conteudo, 'utf8');
  } finally {
    await arquivo.close();
  }

  if (process.platform !== 'win32') {
    await chmod(caminho, modo);
  }
}

function criarConteudosSegredosBase() {
  const senhaPostgresql = gerarValorAleatorio();
  const senhaRedis = gerarValorAleatorio();

  return new Map([
    [
      'marcador-ambiente',
      'VYNTRA_AMBIENTE=staging\nDADOS_PERMITIDOS=sinteticos_ou_sanitizados\n',
    ],
    ['senha-postgresql', `${senhaPostgresql}\n`],
    [
      'url-postgresql',
      `postgresql://vyntra_staging:${senhaPostgresql}@postgres:5432/vyntra_staging?schema=public\n`,
    ],
    [
      'redis.acl',
      `user default off\nuser vyntra_staging on >${senhaRedis} ~* &* +@all\n`,
    ],
    ['url-redis', `redis://vyntra_staging:${senhaRedis}@redis:6379/0\n`],
    ['garage-rpc', `${randomBytes(32).toString('hex')}\n`],
    ['garage-admin', `${gerarValorAleatorio()}\n`],
    ['garage-metricas', `${gerarValorAleatorio()}\n`],
  ]);
}

async function prepararSegredosBase(diretorio = diretorioSegredosPadrao) {
  await mkdir(diretorio, { mode: 0o700, recursive: true });
  await validarDiretorio(diretorio);

  const presencas = await Promise.all(
    arquivosSegredosBase.map(({ nome }) => caminhoExiste(join(diretorio, nome))),
  );
  const quantidadeExistente = presencas.filter(Boolean).length;

  if (quantidadeExistente !== 0 && quantidadeExistente !== presencas.length) {
    throw new Error('CONJUNTO_SEGREDOS_STAGING_INCOMPLETO');
  }

  if (quantidadeExistente === presencas.length) {
    await validarSegredosBase(diretorio);
    return [];
  }

  const conteudos = criarConteudosSegredosBase();
  const criados = [];

  try {
    for (const definicao of arquivosSegredosBase) {
      const caminho = join(diretorio, definicao.nome);
      await criarArquivoExclusivo(
        caminho,
        conteudos.get(definicao.nome),
        definicao.modo,
      );
      criados.push(caminho);
    }
  } catch (erro) {
    await Promise.all(criados.map((caminho) => rm(caminho, { force: true })));
    throw erro;
  }

  await validarSegredosBase(diretorio);
  return arquivosSegredosBase.map(({ nome }) => nome);
}

async function validarSegredosBase(diretorio = diretorioSegredosPadrao) {
  await validarDiretorio(diretorio);

  for (const definicao of arquivosSegredosBase) {
    await validarArquivo(diretorio, definicao);
  }
}

async function obterEstadoCredencialStorage(diretorio = diretorioSegredosPadrao) {
  const presencas = await Promise.all(
    arquivosCredencialStorage.map(({ nome }) =>
      caminhoExiste(join(diretorio, nome)),
    ),
  );

  if (presencas.some(Boolean) && !presencas.every(Boolean)) {
    throw new Error('CREDENCIAL_STORAGE_STAGING_INCOMPLETA');
  }

  return presencas.every(Boolean) ? 'PRESENTE' : 'AUSENTE';
}

async function validarCredencialStorage(diretorio = diretorioSegredosPadrao) {
  await validarDiretorio(diretorio);

  if ((await obterEstadoCredencialStorage(diretorio)) !== 'PRESENTE') {
    throw new Error('CREDENCIAL_STORAGE_STAGING_AUSENTE');
  }

  const [identificador, segredo] = await Promise.all(
    arquivosCredencialStorage.map((definicao) =>
      validarArquivo(diretorio, definicao),
    ),
  );

  return {
    identificador: identificador.trim(),
    segredo: segredo.trim(),
  };
}

async function armazenarCredencialStorage(
  identificador,
  segredo,
  diretorio = diretorioSegredosPadrao,
) {
  if ((await obterEstadoCredencialStorage(diretorio)) !== 'AUSENTE') {
    throw new Error('CREDENCIAL_STORAGE_STAGING_JA_EXISTE');
  }

  const valores = new Map([
    ['chave-storage-id', `${identificador}\n`],
    ['chave-storage-secreta', `${segredo}\n`],
  ]);
  const criados = [];

  try {
    for (const definicao of arquivosCredencialStorage) {
      const conteudo = valores.get(definicao.nome);

      if (!definicao.validar(conteudo)) {
        throw new Error(`CREDENCIAL_STORAGE_STAGING_INVALIDA:${definicao.nome}`);
      }

      const caminho = join(diretorio, definicao.nome);
      await criarArquivoExclusivo(caminho, conteudo, definicao.modo);
      criados.push(caminho);
    }
  } catch (erro) {
    await Promise.all(criados.map((caminho) => rm(caminho, { force: true })));
    throw erro;
  }

  return validarCredencialStorage(diretorio);
}

function executarDocker(
  argumentos,
  ambiente,
  { capturar = false, entrada, codigoErro = 'DOCKER_FALHOU' } = {},
) {
  const resultado = spawnSync('docker', argumentos, {
    cwd: raizRepositorio,
    encoding: capturar ? 'utf8' : undefined,
    env: ambiente,
    input: entrada,
    stdio: capturar ? 'pipe' : 'inherit',
  });

  if (resultado.error !== undefined) {
    if (obterCodigoErro(resultado.error) === 'ENOENT') {
      throw new Error('DOCKER_COMPOSE_NAO_DISPONIVEL');
    }

    throw resultado.error;
  }

  if (resultado.status !== 0) {
    throw new Error(`${codigoErro}:${argumentos.at(-1) ?? 'comando'}`);
  }

  return resultado;
}

function endpointDockerEhLocal(endpoint) {
  return endpoint.startsWith('unix://') || endpoint.startsWith('npipe://');
}

function criarAmbienteDocker() {
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

  return ambiente;
}

function obterContextoDockerLocal(ambiente) {
  const contexto = executarDocker(['context', 'show'], ambiente, {
    capturar: true,
  }).stdout.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(contexto)) {
    throw new Error('CONTEXTO_DOCKER_STAGING_INVALIDO');
  }

  const endpoint = executarDocker(
    [
      'context',
      'inspect',
      contexto,
      '--format',
      '{{.Endpoints.docker.Host}}',
    ],
    ambiente,
    { capturar: true },
  ).stdout.trim();

  if (!endpointDockerEhLocal(endpoint)) {
    throw new Error('CONTEXTO_DOCKER_REMOTO_BLOQUEADO_PARA_STAGING');
  }

  return contexto;
}

function executarDockerCompose(
  argumentos,
  { capturar = false, entrada } = {},
) {
  const ambiente = criarAmbienteDocker();
  const contexto = obterContextoDockerLocal(ambiente);

  return executarDocker(
    [
      '--context',
      contexto,
      'compose',
      '--file',
      caminhoCompose,
      '--project-name',
      nomeProjeto,
      ...argumentos,
    ],
    ambiente,
    {
      capturar,
      codigoErro: 'DOCKER_COMPOSE_STAGING_FALHOU',
      entrada,
    },
  );
}

function interpretarJson(saida, operacao) {
  try {
    return JSON.parse(saida);
  } catch {
    throw new Error(`RESPOSTA_STORAGE_STAGING_INVALIDA:${operacao}`);
  }
}

function executarJsonApiStorage(operacao, corpo) {
  const argumentos = [
    'exec',
    '--no-TTY',
    'storage',
    '/garage',
    'json-api',
    operacao,
  ];
  let entrada;

  if (corpo !== undefined) {
    argumentos.push('-');
    entrada = `${JSON.stringify(corpo)}\n`;
  }

  const resultado = executarDockerCompose(argumentos, {
    capturar: true,
    entrada,
  });

  return interpretarJson(resultado.stdout, operacao);
}

async function inicializarStorage(diretorio = diretorioSegredosPadrao) {
  const chaves = executarJsonApiStorage('ListKeys');
  const chaveExistente = chaves.find(({ name }) => name === nomeChaveStorage);
  const estadoCredencial = await obterEstadoCredencialStorage(diretorio);
  let credencial;

  if (estadoCredencial === 'AUSENTE') {
    if (chaveExistente !== undefined) {
      throw new Error('CHAVE_STORAGE_EXISTE_SEM_SEGREDO_LOCAL');
    }

    const chaveCriada = executarJsonApiStorage('CreateKey', {
      name: nomeChaveStorage,
      neverExpires: true,
    });

    if (
      typeof chaveCriada.accessKeyId !== 'string' ||
      typeof chaveCriada.secretAccessKey !== 'string'
    ) {
      throw new Error('CHAVE_STORAGE_NAO_RETORNOU_CREDENCIAL');
    }

    credencial = await armazenarCredencialStorage(
      chaveCriada.accessKeyId,
      chaveCriada.secretAccessKey,
      diretorio,
    );
  } else {
    credencial = await validarCredencialStorage(diretorio);

    if (
      chaveExistente === undefined ||
      chaveExistente.id !== credencial.identificador
    ) {
      throw new Error('CHAVE_STORAGE_DIVERGE_DO_SEGREDO_LOCAL');
    }
  }

  const buckets = executarJsonApiStorage('ListBuckets');
  let bucket = buckets.find(({ globalAliases }) =>
    globalAliases.includes(nomeBucketStorage),
  );

  if (bucket === undefined) {
    bucket = executarJsonApiStorage('CreateBucket', {
      globalAlias: nomeBucketStorage,
    });
  }

  executarJsonApiStorage('DenyBucketKey', {
    accessKeyId: credencial.identificador,
    bucketId: bucket.id,
    permissions: { owner: true, read: false, write: false },
  });
  const resultado = executarJsonApiStorage('AllowBucketKey', {
    accessKeyId: credencial.identificador,
    bucketId: bucket.id,
    permissions: { owner: false, read: true, write: true },
  });
  const acesso = resultado.keys.find(
    ({ accessKeyId }) => accessKeyId === credencial.identificador,
  );

  if (
    acesso?.permissions.read !== true ||
    acesso.permissions.write !== true ||
    acesso.permissions.owner !== false ||
    resultado.websiteAccess !== false
  ) {
    throw new Error('PERMISSAO_STORAGE_STAGING_INVALIDA');
  }
}

function exigirConfirmacao() {
  if (process.env.VYNTRA_CONFIRMAR_STAGING !== confirmacaoObrigatoria) {
    throw new Error(
      'CONFIRMACAO_STAGING_AUSENTE; defina VYNTRA_CONFIRMAR_STAGING conforme o runbook',
    );
  }
}

async function validarAmbiente() {
  await validarSegredosBase();
  const estadoCredencial = await obterEstadoCredencialStorage();

  if (estadoCredencial === 'PRESENTE') {
    await validarCredencialStorage();
  }

  executarDockerCompose(['version'], { capturar: true });
  executarDockerCompose(['config', '--quiet']);
}

async function executarSmoke() {
  await validarSegredosBase();
  await validarCredencialStorage();

  const saudeStorage = executarJsonApiStorage('GetClusterHealth');

  if (saudeStorage.status !== 'healthy') {
    throw new Error('STORAGE_STAGING_NAO_SAUDAVEL');
  }

  executarDockerCompose(
    [
      'exec',
      '--no-TTY',
      'postgres',
      'sh',
      '-ec',
      'PGPASSWORD="$(cat /run/secrets/senha_postgresql)" psql --host 127.0.0.1 --username vyntra_staging --dbname vyntra_staging --tuples-only --command "SELECT 1" | grep -Fq 1',
    ],
    { capturar: true },
  );
  executarDockerCompose(
    [
      'exec',
      '--no-TTY',
      'redis',
      'sh',
      '-ec',
      `REDISCLI_AUTH="$(sed -n 's/^user vyntra_staging on >\\([^ ]*\\).*/\\1/p' /run/secrets/redis.acl)" redis-cli --user vyntra_staging ping | grep -Fqx PONG`,
    ],
    { capturar: true },
  );

  const resposta = await fetch('http://127.0.0.1:3100/');

  if (resposta.status !== 404) {
    throw new Error(`API_STAGING_STATUS_INESPERADO:${resposta.status}`);
  }
}

async function executarComando(comando) {
  switch (comando) {
    case 'preparar': {
      const criados = await prepararSegredosBase();
      const resumo = criados.length === 0 ? 'já estavam prontos' : 'foram criados';
      console.log(`Segredos-base de staging ${resumo}; nenhum valor foi exibido.`);
      break;
    }
    case 'validar':
      await validarAmbiente();
      console.log('Configuração de staging isolado válida.');
      break;
    case 'subir':
      exigirConfirmacao();
      await prepararSegredosBase();
      await validarAmbiente();
      executarDockerCompose([
        'up',
        '--detach',
        '--pull',
        'missing',
        '--wait',
        'postgres',
        'redis',
        'storage',
      ]);
      await inicializarStorage();
      executarDockerCompose(['up', '--build', '--detach', '--wait', 'api']);
      await executarSmoke();
      console.log('Staging isolado saudável; somente dados sintéticos ou sanitizados.');
      break;
    case 'smoke':
      await executarSmoke();
      console.log('Smoke test do staging isolado concluído.');
      break;
    case 'estado':
      executarDockerCompose(['ps']);
      break;
    case 'parar':
      exigirConfirmacao();
      executarDockerCompose(['down']);
      console.log('Staging parado; volumes exclusivos preservados.');
      break;
    default:
      throw new Error(
        'COMANDO_INVALIDO; use preparar, validar, subir, smoke, estado ou parar',
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
    console.error(`Staging isolado bloqueado: ${mensagem}`);
    process.exitCode = 1;
  }
}

export {
  arquivosCredencialStorage,
  arquivosSegredosBase,
  armazenarCredencialStorage,
  confirmacaoObrigatoria,
  diretorioSegredosPadrao,
  endpointDockerEhLocal,
  obterEstadoCredencialStorage,
  prepararSegredosBase,
  validarCredencialStorage,
  validarSegredosBase,
};
