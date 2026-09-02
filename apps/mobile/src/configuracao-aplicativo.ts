const SERVIDOR_PADRAO_STAGING = 'https://omni.up100.com.br';

function normalizarServidor(valor: string | undefined): string {
  const servidor = valor?.trim() || SERVIDOR_PADRAO_STAGING;
  const url = new URL(servidor);
  const hostLocal = new Set(['10.0.2.2', '127.0.0.1', 'localhost']).has(
    url.hostname,
  );

  if (url.protocol !== 'https:' && !(__DEV__ && hostLocal)) {
    throw new Error('SERVIDOR_MOBILE_INSEGURO');
  }

  return url.origin;
}

function normalizarChavesPublicas(
  valor: string | undefined,
): Readonly<Record<string, string>> {
  if (valor === undefined || valor.trim().length === 0) return Object.freeze({});
  let informado: unknown;
  try {
    informado = JSON.parse(valor);
  } catch {
    throw new Error('CHAVES_AUTORIZACAO_OFFLINE_INVALIDAS');
  }
  if (informado === null || typeof informado !== 'object' || Array.isArray(informado)) {
    throw new Error('CHAVES_AUTORIZACAO_OFFLINE_INVALIDAS');
  }
  const chaves: Record<string, string> = {};
  for (const [identificador, chave] of Object.entries(informado)) {
    if (
      !/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(identificador) ||
      typeof chave !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/u.test(chave)
    ) {
      throw new Error('CHAVES_AUTORIZACAO_OFFLINE_INVALIDAS');
    }
    chaves[identificador] = chave;
  }
  return Object.freeze(chaves);
}

export const CONFIGURACAO_APLICATIVO = Object.freeze({
  chavesPublicasAutorizacaoOffline: normalizarChavesPublicas(
    process.env.EXPO_PUBLIC_CHAVES_AUTORIZACAO_OFFLINE,
  ),
  servidor: normalizarServidor(process.env.EXPO_PUBLIC_API_URL),
  versao: process.env.EXPO_PUBLIC_VERSAO_APLICATIVO?.trim() || '0.0.0',
});
