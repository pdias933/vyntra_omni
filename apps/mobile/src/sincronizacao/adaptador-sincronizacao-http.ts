import {
  client,
  ressincronizarCompleta,
  sincronizarIncremental,
} from '@vyntra/api-client';

import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import {
  normalizarLoteMobile,
  normalizarSnapshotMobile,
  type LoteSincronizacaoMobile,
  type SnapshotMobileValidado,
} from './modelo-sincronizacao-mobile';

export interface CredenciaisTransporteSincronizacaoMobile {
  readonly dispositivoId: string;
  readonly segredoDispositivo: string;
  readonly tokenAcesso: string;
}

interface RespostaSdk<T> {
  readonly data?: T | undefined;
  readonly error?: unknown | undefined;
  readonly response?: Response | undefined;
}

export class ErroSincronizacaoMobile extends Error {
  public constructor(
    public readonly codigo: string,
    public readonly statusHttp?: number,
  ) {
    super(codigo);
    this.name = 'ErroSincronizacaoMobile';
  }
}

function codigoErro(valor: unknown): string {
  if (valor !== null && typeof valor === 'object') {
    const direto = Reflect.get(valor, 'codigo');
    if (typeof direto === 'string' && direto.length > 0) return direto;
    const erro = Reflect.get(valor, 'erro');
    if (erro !== null && typeof erro === 'object') {
      const encapsulado = Reflect.get(erro, 'codigo');
      if (typeof encapsulado === 'string' && encapsulado.length > 0) {
        return encapsulado;
      }
    }
  }
  return 'SINCRONIZACAO_INDISPONIVEL';
}

function exigirDado<T>(resposta: RespostaSdk<T>): T {
  if (resposta.data !== undefined) return resposta.data;
  throw new ErroSincronizacaoMobile(
    codigoErro(resposta.error),
    resposta.response?.status,
  );
}

function opcoesAutenticadas(credenciais: CredenciaisTransporteSincronizacaoMobile) {
  return {
    auth: credenciais.tokenAcesso,
    headers: {
      'x-dispositivo-id': credenciais.dispositivoId,
      'x-segredo-dispositivo': credenciais.segredoDispositivo,
    },
  } as const;
}

client.setConfig({ baseUrl: CONFIGURACAO_APLICATIVO.servidor });

export class AdaptadorSincronizacaoHttp {
  public async obterSnapshot(
    credenciais: CredenciaisTransporteSincronizacaoMobile,
  ): Promise<SnapshotMobileValidado> {
    const resposta = await ressincronizarCompleta({
      ...opcoesAutenticadas(credenciais),
    });
    try {
      return normalizarSnapshotMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroSincronizacaoMobile) throw erro;
      throw new ErroSincronizacaoMobile('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
  }

  public async obterLote(
    cursor: string,
    credenciais: CredenciaisTransporteSincronizacaoMobile,
  ): Promise<LoteSincronizacaoMobile> {
    const resposta = await sincronizarIncremental({
      ...opcoesAutenticadas(credenciais),
      query: { apos: cursor, limite: '100' },
    });
    try {
      return normalizarLoteMobile(exigirDado(resposta), cursor);
    } catch (erro) {
      if (erro instanceof ErroSincronizacaoMobile) throw erro;
      throw new ErroSincronizacaoMobile('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
  }
}
