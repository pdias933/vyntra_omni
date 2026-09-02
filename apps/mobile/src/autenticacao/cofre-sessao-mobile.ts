import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE_IDENTIFICADOR_INSTALACAO = 'autenticacao.identificador-instalacao';
const CHAVE_SEGREDO_VINCULO = 'autenticacao.segredo-vinculo';
const CHAVE_DISPOSITIVO_ID = 'autenticacao.dispositivo-id';
const CHAVE_TOKEN_REFRESH = 'autenticacao.token-refresh';
const CHAVE_SESSAO_ID = 'autenticacao.sessao-id';
const CHAVE_USUARIO_ID = 'autenticacao.usuario-id';
const CHAVE_NOME_EXIBICAO = 'autenticacao.nome-exibicao';
const OPCOES_COFRE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface IdentidadeInstalacaoMobile {
  readonly identificadorInstalacao: string;
  readonly segredoVinculo: string;
}

export interface CredencialPersistidaMobile {
  readonly dispositivoId: string;
  readonly nomeExibicao: string;
  readonly sessaoId: string;
  readonly tokenRefresh: string;
  readonly usuarioId: string;
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
      SecureStore.setItemAsync(CHAVE_SESSAO_ID, credencial.sessaoId, OPCOES_COFRE),
      SecureStore.setItemAsync(CHAVE_USUARIO_ID, credencial.usuarioId, OPCOES_COFRE),
      SecureStore.setItemAsync(
        CHAVE_NOME_EXIBICAO,
        credencial.nomeExibicao,
        OPCOES_COFRE,
      ),
    ]);
  }

  public async obterCredencial(): Promise<CredencialPersistidaMobile | undefined> {
    const [dispositivoId, nomeExibicao, sessaoId, tokenRefresh, usuarioId] =
      await Promise.all([
      SecureStore.getItemAsync(CHAVE_DISPOSITIVO_ID),
      SecureStore.getItemAsync(CHAVE_NOME_EXIBICAO),
      SecureStore.getItemAsync(CHAVE_SESSAO_ID),
      SecureStore.getItemAsync(CHAVE_TOKEN_REFRESH),
      SecureStore.getItemAsync(CHAVE_USUARIO_ID),
    ]);
    return dispositivoId === null ||
      nomeExibicao === null ||
      sessaoId === null ||
      tokenRefresh === null ||
      usuarioId === null
      ? undefined
      : { dispositivoId, nomeExibicao, sessaoId, tokenRefresh, usuarioId };
  }

  public async limparCredencial(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(CHAVE_DISPOSITIVO_ID),
      SecureStore.deleteItemAsync(CHAVE_NOME_EXIBICAO),
      SecureStore.deleteItemAsync(CHAVE_SESSAO_ID),
      SecureStore.deleteItemAsync(CHAVE_TOKEN_REFRESH),
      SecureStore.deleteItemAsync(CHAVE_USUARIO_ID),
    ]);
  }

  public async substituirIdentidadeInstalacao(): Promise<IdentidadeInstalacaoMobile> {
    await Promise.all([
      SecureStore.deleteItemAsync(CHAVE_IDENTIFICADOR_INSTALACAO),
      SecureStore.deleteItemAsync(CHAVE_SEGREDO_VINCULO),
      SecureStore.deleteItemAsync(CHAVE_DISPOSITIVO_ID),
      SecureStore.deleteItemAsync(CHAVE_NOME_EXIBICAO),
      SecureStore.deleteItemAsync(CHAVE_SESSAO_ID),
      SecureStore.deleteItemAsync(CHAVE_TOKEN_REFRESH),
      SecureStore.deleteItemAsync(CHAVE_USUARIO_ID),
    ]);
    return this.obterOuCriarIdentidadeInstalacao();
  }
}
