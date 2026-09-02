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

export const CONFIGURACAO_APLICATIVO = Object.freeze({
  servidor: normalizarServidor(process.env.EXPO_PUBLIC_API_URL),
  versao: process.env.EXPO_PUBLIC_VERSAO_APLICATIVO?.trim() || '0.0.0',
});
