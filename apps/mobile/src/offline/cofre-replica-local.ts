import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE_BANCO = 'replica.chave-banco';
const CHAVE_ULTIMO_RELOGIO = 'replica.ultimo-relogio-confiavel';
const CHAVE_HEXADECIMAL = /^[a-f0-9]{64}$/u;
const OPCOES_COFRE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function codificarHexadecimal(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class CofreReplicaLocal {
  public async obterOuCriarChaveBanco(): Promise<string> {
    const existente = await SecureStore.getItemAsync(CHAVE_BANCO);
    if (existente !== null) {
      if (!CHAVE_HEXADECIMAL.test(existente)) {
        throw new Error('CHAVE_REPLICA_LOCAL_INVALIDA');
      }
      return existente;
    }
    const nova = codificarHexadecimal(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(CHAVE_BANCO, nova, OPCOES_COFRE);
    return nova;
  }

  public async obterUltimoRelogioConfiavel(): Promise<Date | undefined> {
    const valor = await SecureStore.getItemAsync(CHAVE_ULTIMO_RELOGIO);
    if (valor === null) return undefined;
    const instante = new Date(valor);
    if (!Number.isFinite(instante.getTime()) || instante.toISOString() !== valor) {
      throw new Error('RELOGIO_CONFIAVEL_LOCAL_INVALIDO');
    }
    return instante;
  }

  public async registrarRelogioConfiavel(instante: Date): Promise<void> {
    if (!Number.isFinite(instante.getTime())) {
      throw new Error('RELOGIO_CONFIAVEL_LOCAL_INVALIDO');
    }
    const anterior = await this.obterUltimoRelogioConfiavel();
    if (anterior === undefined || instante > anterior) {
      await SecureStore.setItemAsync(
        CHAVE_ULTIMO_RELOGIO,
        instante.toISOString(),
        OPCOES_COFRE,
      );
    }
  }

  public async limpar(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(CHAVE_BANCO),
      SecureStore.deleteItemAsync(CHAVE_ULTIMO_RELOGIO),
    ]);
  }
}
