import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

const IDENTIFICACAO_SISTEMA = /^MK[0-9]{1,4}$/u;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export type ModoMkSolutions =
  | 'CARACTERIZACAO'
  | 'DESATIVADO'
  | 'SOMENTE_LEITURA';

export interface ConfiguracaoMkSolutions {
  readonly codigoServico: number;
  readonly contraSenha: string;
  readonly hostPermitido: string;
  readonly identificacaoSistema: string;
  readonly limiteConcorrencia: number;
  readonly limiteCorpoBytes: number;
  readonly origem: URL;
  readonly tempoEsperaMs: number;
  readonly tokenCadastroUsuario: string;
}

export function obterModoMkSolutions(
  ambiente: NodeJS.ProcessEnv = process.env,
): ModoMkSolutions {
  const modo = ambiente.MK_MODO ?? 'DESATIVADO';
  if (
    modo !== 'DESATIVADO' &&
    modo !== 'CARACTERIZACAO' &&
    modo !== 'SOMENTE_LEITURA'
  ) {
    throw new Error('MODO_MK_INVALIDO');
  }
  return modo;
}

export async function carregarConfiguracaoMkSolutions(
  ambiente: NodeJS.ProcessEnv = process.env,
): Promise<ConfiguracaoMkSolutions | undefined> {
  const modo = obterModoMkSolutions(ambiente);
  if (modo !== 'SOMENTE_LEITURA') return undefined;
  if (ambiente.DADOS_PERMITIDOS === 'sinteticos_ou_sanitizados') {
    throw new Error('DADOS_REAIS_MK_PROIBIDOS_NESTE_AMBIENTE');
  }

  const origem = validarOrigem(ambiente.MK_ORIGEM);
  const hostPermitido = ambiente.MK_HOST_PERMITIDO?.toLowerCase();
  if (
    hostPermitido === undefined ||
    !HOST.test(hostPermitido) ||
    isIP(hostPermitido) !== 0 ||
    origem.hostname.toLowerCase() !== hostPermitido
  ) {
    throw new Error('HOST_MK_INVALIDO');
  }
  const identificacaoSistema = ambiente.MK_IDENTIFICACAO_SISTEMA;
  if (
    identificacaoSistema === undefined ||
    !IDENTIFICACAO_SISTEMA.test(identificacaoSistema)
  ) {
    throw new Error('IDENTIFICACAO_SISTEMA_MK_INVALIDA');
  }
  const codigoServico = inteiroNoIntervalo(
    ambiente.MK_CODIGO_SERVICO,
    1,
    9_999,
    'CODIGO_SERVICO_MK_INVALIDO',
  );
  if (codigoServico === 9_999) {
    throw new Error('PRIVILEGIO_MK_EXCESSIVO');
  }
  const tokenCadastroUsuario = await lerSegredoEstrito(
    ambiente.MK_TOKEN_CADASTRO_USUARIO_FILE,
  );
  const contraSenha = await lerSegredoEstrito(
    ambiente.MK_CONTRASENHA_PERFIL_FILE,
  );

  return {
    codigoServico,
    contraSenha,
    hostPermitido,
    identificacaoSistema,
    limiteConcorrencia: inteiroNoIntervalo(
      ambiente.MK_LIMITE_CONCORRENCIA ?? '4',
      1,
      8,
      'LIMITE_CONCORRENCIA_MK_INVALIDO',
    ),
    limiteCorpoBytes: inteiroNoIntervalo(
      ambiente.MK_LIMITE_CORPO_BYTES ?? String(1024 * 1024),
      1_024,
      1024 * 1024,
      'LIMITE_CORPO_MK_INVALIDO',
    ),
    origem,
    tempoEsperaMs: inteiroNoIntervalo(
      ambiente.MK_TEMPO_ESPERA_MS ?? '5000',
      1_000,
      15_000,
      'TEMPO_ESPERA_MK_INVALIDO',
    ),
    tokenCadastroUsuario,
  };
}

async function lerSegredoEstrito(caminho: string | undefined): Promise<string> {
  if (caminho === undefined || caminho.length === 0) {
    throw new Error('SEGREDO_MK_AUSENTE');
  }
  const conteudo = await readFile(caminho, 'utf8');
  const valor = conteudo.endsWith('\r\n')
    ? conteudo.slice(0, -2)
    : conteudo.endsWith('\n')
      ? conteudo.slice(0, -1)
      : conteudo;
  if (
    valor.length === 0 ||
    valor.length > 4_096 ||
    /[\0\r\n]/u.test(valor)
  ) {
    throw new Error('SEGREDO_MK_INVALIDO');
  }
  return valor;
}

function validarOrigem(valor: string | undefined): URL {
  if (valor === undefined) throw new Error('ORIGEM_MK_AUSENTE');
  let origem: URL;
  try {
    origem = new URL(valor);
  } catch {
    throw new Error('ORIGEM_MK_INVALIDA');
  }
  if (
    origem.protocol !== 'https:' ||
    origem.username !== '' ||
    origem.password !== '' ||
    origem.pathname !== '/' ||
    origem.search !== '' ||
    origem.hash !== '' ||
    origem.hostname.length === 0 ||
    isIP(origem.hostname) !== 0
  ) {
    throw new Error('ORIGEM_MK_INVALIDA');
  }
  return origem;
}

function inteiroNoIntervalo(
  valor: string | undefined,
  minimo: number,
  maximo: number,
  codigoErro: string,
): number {
  if (valor === undefined || !/^[0-9]+$/u.test(valor)) {
    throw new Error(codigoErro);
  }
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(codigoErro);
  }
  return numero;
}
