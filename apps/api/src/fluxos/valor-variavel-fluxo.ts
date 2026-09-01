import type { TipoVariavelFluxo } from './modelo-validacao-fluxo.js';

export const OPERADORES_CONDICAO_FLUXO = [
  'IGUAL',
  'DIFERENTE',
  'MENOR_QUE',
  'MENOR_OU_IGUAL',
  'MAIOR_QUE',
  'MAIOR_OU_IGUAL',
  'ANTES_DE',
  'DEPOIS_DE',
  'CONTEM',
  'COMECA_COM',
  'TERMINA_COM',
] as const;

export type OperadorCondicaoFluxo =
  (typeof OPERADORES_CONDICAO_FLUXO)[number];

export type ValorVariavelFluxo = boolean | number | string;

const UUID_CANONICO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL_CANONICO = /^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,6})?$/u;
const DATA_HORA_CANONICA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const operadores = (
  ...valores: readonly OperadorCondicaoFluxo[]
): ReadonlySet<OperadorCondicaoFluxo> => new Set(valores);

const OPERADORES_POR_TIPO: Readonly<
  Record<TipoVariavelFluxo, ReadonlySet<OperadorCondicaoFluxo>>
> = Object.freeze({
  BOOLEANO: operadores('IGUAL', 'DIFERENTE'),
  DATA_HORA: operadores('IGUAL', 'DIFERENTE', 'ANTES_DE', 'DEPOIS_DE'),
  DECIMAL: operadores(
    'IGUAL',
    'DIFERENTE',
    'MENOR_QUE',
    'MENOR_OU_IGUAL',
    'MAIOR_QUE',
    'MAIOR_OU_IGUAL',
  ),
  INTEIRO: operadores(
    'IGUAL',
    'DIFERENTE',
    'MENOR_QUE',
    'MENOR_OU_IGUAL',
    'MAIOR_QUE',
    'MAIOR_OU_IGUAL',
  ),
  TEXTO: operadores(
    'IGUAL',
    'DIFERENTE',
    'CONTEM',
    'COMECA_COM',
    'TERMINA_COM',
  ),
  UUID: operadores('IGUAL', 'DIFERENTE'),
});

export function ehOperadorCondicaoFluxo(
  valor: unknown,
): valor is OperadorCondicaoFluxo {
  return (
    typeof valor === 'string' &&
    OPERADORES_CONDICAO_FLUXO.some((operador) => operador === valor)
  );
}

export function operadorCompativelComTipo(
  tipo: TipoVariavelFluxo,
  operador: OperadorCondicaoFluxo,
): boolean {
  return OPERADORES_POR_TIPO[tipo].has(operador);
}

export function valorCompativelComTipo(
  tipo: TipoVariavelFluxo,
  valor: unknown,
): valor is ValorVariavelFluxo {
  switch (tipo) {
    case 'BOOLEANO':
      return typeof valor === 'boolean';
    case 'DATA_HORA':
      return (
        typeof valor === 'string' &&
        DATA_HORA_CANONICA.test(valor) &&
        Number.isFinite(Date.parse(valor)) &&
        new Date(valor).toISOString() === valor
      );
    case 'DECIMAL':
      return typeof valor === 'string' && DECIMAL_CANONICO.test(valor);
    case 'INTEIRO':
      return typeof valor === 'number' && Number.isSafeInteger(valor);
    case 'TEXTO':
      return (
        typeof valor === 'string' &&
        !valor.includes('\u0000') &&
        valor.length <= 4_096
      );
    case 'UUID':
      return typeof valor === 'string' && UUID_CANONICO.test(valor);
  }
}

export function avaliarCondicaoTipada(
  tipo: TipoVariavelFluxo,
  operador: OperadorCondicaoFluxo,
  esquerda: unknown,
  direita: unknown,
): boolean | undefined {
  if (
    !operadorCompativelComTipo(tipo, operador) ||
    !valorCompativelComTipo(tipo, esquerda) ||
    !valorCompativelComTipo(tipo, direita)
  ) {
    return undefined;
  }
  if (operador === 'CONTEM') {
    return (esquerda as string).includes(direita as string);
  }
  if (operador === 'COMECA_COM') {
    return (esquerda as string).startsWith(direita as string);
  }
  if (operador === 'TERMINA_COM') {
    return (esquerda as string).endsWith(direita as string);
  }
  const ordem = comparar(tipo, esquerda, direita);
  switch (operador) {
    case 'IGUAL':
      return ordem === 0;
    case 'DIFERENTE':
      return ordem !== 0;
    case 'MENOR_QUE':
    case 'ANTES_DE':
      return ordem < 0;
    case 'MENOR_OU_IGUAL':
      return ordem <= 0;
    case 'MAIOR_QUE':
    case 'DEPOIS_DE':
      return ordem > 0;
    case 'MAIOR_OU_IGUAL':
      return ordem >= 0;
    default:
      return undefined;
  }
}

function comparar(
  tipo: TipoVariavelFluxo,
  esquerda: ValorVariavelFluxo,
  direita: ValorVariavelFluxo,
): number {
  if (tipo === 'DECIMAL') {
    return compararBigInt(decimalEscalado(esquerda as string), decimalEscalado(direita as string));
  }
  if (tipo === 'DATA_HORA') {
    return compararNumero(Date.parse(esquerda as string), Date.parse(direita as string));
  }
  if (tipo === 'INTEIRO') {
    return compararNumero(esquerda as number, direita as number);
  }
  if (tipo === 'BOOLEANO') {
    return compararNumero(Number(esquerda), Number(direita));
  }
  return esquerda === direita ? 0 : (esquerda as string) < (direita as string) ? -1 : 1;
}

function decimalEscalado(valor: string): bigint {
  const negativo = valor.startsWith('-');
  const semSinal = negativo ? valor.slice(1) : valor;
  const [inteiro = '0', fracao = ''] = semSinal.split('.');
  const escalado = BigInt(`${inteiro}${fracao.padEnd(6, '0')}`);
  return negativo ? -escalado : escalado;
}

function compararNumero(esquerda: number, direita: number): number {
  return esquerda === direita ? 0 : esquerda < direita ? -1 : 1;
}

function compararBigInt(esquerda: bigint, direita: bigint): number {
  return esquerda === direita ? 0 : esquerda < direita ? -1 : 1;
}
