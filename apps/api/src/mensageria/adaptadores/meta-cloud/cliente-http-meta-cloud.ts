export interface RespostaHttpMetaCloud {
  readonly status: number;
  readonly corpo: unknown;
}

export interface ClienteHttpMetaCloud {
  postarJson(
    caminho: string,
    tokenAcesso: string,
    corpo: Readonly<Record<string, unknown>>,
    sinal?: AbortSignal,
  ): Promise<RespostaHttpMetaCloud>;
}

export interface ConfiguracaoEnvioMetaCloud {
  readonly graphApiVersion: string;
  readonly identificadorNumeroExterno: string;
  readonly tokenAcesso: string;
}

export interface ProvedorConfiguracaoEnvioMetaCloud {
  obter(contaMensageriaId: string): Promise<ConfiguracaoEnvioMetaCloud | undefined>;
}

export class ErroTransporteMetaCloud extends Error {
  public constructor(public readonly tipo: 'REDE' | 'TIMEOUT') {
    super('TRANSPORTE_META_CLOUD_INDISPONIVEL');
    this.name = 'ErroTransporteMetaCloud';
  }
}
