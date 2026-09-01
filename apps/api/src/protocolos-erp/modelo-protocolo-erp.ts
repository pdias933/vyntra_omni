export type EstadoProtocoloErp = 'PENDENTE' | 'OFICIAL';

export interface ProtocoloErpPersistido {
  readonly atendimentoId: string;
  readonly estado: EstadoProtocoloErp;
  readonly protocoloOficial?: string | undefined;
  readonly confirmadoEm?: Date | undefined;
  readonly versao: number;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

