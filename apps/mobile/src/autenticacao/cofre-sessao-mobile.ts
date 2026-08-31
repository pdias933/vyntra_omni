import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE_IDENTIFICADOR_INSTALACAO = 'autenticacao.identificador-instalacao';
const CHAVE_SEGREDO_VINCULO = 'autenticacao.segredo-vinculo';
const CHAVE_DISPOSITIVO_ID = 'autenticacao.dispositivo-id';
const CHAVE_TOKEN_REFRESH = 'autenticacao.token-refresh';
const OPCOES_COFRE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface IdentidadeInstalacaoMobile {
  readonly identificadorInstalacao: string;
  readonly segredoVinculo: string;
}

export interface CredencialPersistidaMobile {
  readonly dispositivoId: string;
  readonly tokenRefresh: string;
}

function codificarBase64Url(bytes: Uint8Array): string {
  const alfabeto =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let resultado = '';
  for (let indice = 0; indice < bytes.length; indice += 3) {
    const primeiro = bytes[indice] ?? 0;
    const segundo = bytes[indice + 1] ?? 0;
    const terceiro = bytes[indice + 2] ?? 0;
    const valor = (primeiro << 16) | (segundo << 8) | terceiro;
    resultado += alfabeto[(valor >> 18) & 63];
    resultado += alfabeto[(valor >> 12) & 63];
    if (indice + 1 < bytes.length) resultado += alfabeto[(valor >> 6) & 63];
    if (indice + 2 < bytes.length) resultado += alfabeto[valor & 63];
  }
  return resultado;
}

async function gerarSegredoVinculo(): Promise<string> {
  return codificarBase64Url(await Crypto.getRandomBytesAsync(32));
}

export class CofreSessaoMobile {
  public async obterOuCriarIdentidadeInstalacao(): Promise<IdentidadeInstalacaoMobile> {
    const [identificadorInstalacao, segredoVinculo] = await Promise.all([
      SecureStore.getItemAsync(CHAVE_IDENTIFICADOR_INSTALACAO),
      SecureStore.getItemAsync(CHAVE_SEGREDO_VINCULO),
    ]);
    if (identificadorInstalacao !== null && segredoVinculo !== null) {
      return { identificadorInstalacao, segredoVinculo };
    }

    const novaIdentidade = {
      identificadorInstalacao: Crypto.randomUUID(),
      segredoVinculo: await gerarSegredoVinculo(),
    };
    await Promise.all([
      SecureStore.setItemAsync(
        CHAVE_IDENTIFICADOR_INSTALACAO,
        novaIdentidade.identificadorInstalacao,
        OPCOES_COFRE,
      ),
      SecureStore.setItemAsync(
        CHAVE_SEGREDO_VINCULO,
        novaIdentidade.segredoVinculo,
        OPCOES_COFRE,
      ),
    ]);
    return novaIdentidade;
  }

  public async salvarCredencial(
    credencial: CredencialPersistidaMobile,
  ): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(
        CHAVE_DISPOSITIVO_ID,
        credencial.dispositivoId,
        OPCOES_COFRE,
      ),
      SecureStore.setItemAsync(
        CHAVE_TOKEN_REFRESH,
        credencial.tokenRefresh,
        OPCOES_COFRE,
      ),
    ]);
  }

  public async obterCredencial(): Promise<CredencialPersistidaMobile | undefined> {
    const [dispositivoId, tokenRefresh] = await Promise.all([
      SecureStore.getItemAsync(CHAVE_DISPOSITIVO_ID),
      SecureStore.getItemAsync(CHAVE_TOKEN_REFRESH),
    ]);
    return dispositivoId === null || tokenRefresh === null
      ? undefined
      : { dispositivoId, tokenRefresh };
  }

  public async limparCredencial(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(CHAVE_DISPOSITIVO_ID),
      SecureStore.deleteItemAsync(CHAVE_TOKEN_REFRESH),
    ]);
  }
}
