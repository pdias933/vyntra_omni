export type TipoHistoricoAtribuicao =
  | 'ENTRADA_FILA'
  | 'RESGATE'
  | 'TRANSFERENCIA_FILA'
  | 'TRANSFERENCIA_USUARIO'
  | 'ASSUNCAO_SUPERVISOR'
  | 'REABERTURA';

export interface HistoricoAtribuicaoPersistido {
  readonly id: string;
  readonly atendimentoId: string;
  readonly filaId: string;
  readonly usuarioResponsavelId?: string | undefined;
  readonly tipo: TipoHistoricoAtribuicao;
  readonly iniciadoEm: Date;
  readonly finalizadoEm?: Date | undefined;
  readonly executadoPorUsuarioId?: string | undefined;
}

export interface AtribuicaoAtualAtendimento {
  readonly filaId?: string | undefined;
  readonly usuarioResponsavelId?: string | undefined;
}

export interface EntradaHistoricoAtribuicao {
  readonly filaId: string;
  readonly usuarioResponsavelId?: string | undefined;
  readonly tipo: TipoHistoricoAtribuicao;
  readonly executadoPorUsuarioId?: string | undefined;
}
