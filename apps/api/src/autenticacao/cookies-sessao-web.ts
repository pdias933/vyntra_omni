import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import { ErroRequisicaoWebNaoConfiavel } from './erros-autenticacao.js';

export const NOME_COOKIE_SESSAO_WEB = '__Host-vyntra_sessao';
export const NOME_COOKIE_CSRF_WEB = '__Host-vyntra_csrf';
export const NOME_HEADER_CSRF_WEB = 'x-csrf-token';

const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;

function obterCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (cabecalho === undefined || cabecalho.length > 8_192) {
    return undefined;
  }
  const encontrados = cabecalho
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte.startsWith(`${nome}=`))
    .map((parte) => parte.slice(nome.length + 1));
  if (encontrados.length !== 1 || !SEGREDO_OPACO.test(encontrados[0] ?? '')) {
    return undefined;
  }
  return encontrados[0];
}

export function obterTokenSessaoWeb(cabecalhoCookie: string | undefined): string {
  const token = obterCookie(cabecalhoCookie, NOME_COOKIE_SESSAO_WEB);
  if (token === undefined) {
    throw new ErroNaoAutenticado();
  }
  return token;
}

export function obterTokenCsrfWeb(
  cabecalhoCookie: string | undefined,
  cabecalhoCsrf: string | undefined,
): string {
  const csrfCookie = obterCookie(cabecalhoCookie, NOME_COOKIE_CSRF_WEB);
  if (
    csrfCookie === undefined ||
    cabecalhoCsrf === undefined ||
    !SEGREDO_OPACO.test(cabecalhoCsrf) ||
    csrfCookie !== cabecalhoCsrf
  ) {
    throw new ErroRequisicaoWebNaoConfiavel();
  }
  return csrfCookie;
}

export function serializarCookiesSessaoWeb(
  token: string,
  csrf: string,
  expiraEm: Date,
): readonly [string, string] {
  if (!SEGREDO_OPACO.test(token) || !SEGREDO_OPACO.test(csrf)) {
    throw new Error('SEGREDO_COOKIE_INVALIDO');
  }
  const maxAge = Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1_000));
  const atributos = `Path=/; Max-Age=${maxAge}; Expires=${expiraEm.toUTCString()}; Secure; SameSite=Strict`;
  return [
    `${NOME_COOKIE_SESSAO_WEB}=${token}; ${atributos}; HttpOnly`,
    `${NOME_COOKIE_CSRF_WEB}=${csrf}; ${atributos}`,
  ];
}

export function serializarRemocaoCookiesSessaoWeb(): readonly [string, string] {
  const atributos =
    'Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict';
  return [
    `${NOME_COOKIE_SESSAO_WEB}=; ${atributos}; HttpOnly`,
    `${NOME_COOKIE_CSRF_WEB}=; ${atributos}`,
  ];
}
