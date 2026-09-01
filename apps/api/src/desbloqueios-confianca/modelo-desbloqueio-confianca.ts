export interface EntradaVerificacaoDesbloqueioConfianca {
  readonly atendimentoId: string;
  readonly contratoExternoId: string;
  readonly filaId: string;
}

export interface UltimoDesbloqueioConfianca {
  readonly confirmadoEm: Date;
}

export type MotivoInelegibilidadeDesbloqueioConfianca =
  | 'ERP_NAO_AUTORIZOU'
  | 'INTERVALO_30_DIAS';

export type ResultadoVerificacaoDesbloqueioConfianca =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: 'TEMPO_REAL';
      readonly consultadoEm: Date;
      readonly elegivel: boolean;
      readonly motivos: readonly MotivoInelegibilidadeDesbloqueioConfianca[];
      readonly ultimoDesbloqueioConfirmadoEm?: Date;
      readonly proximoDesbloqueioEm?: Date;
    }
  | {
      readonly resultado: 'NAO_ENCONTRADO';
      readonly origem: 'TEMPO_REAL';
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'CAPACIDADE_NAO_HABILITADA' | 'ERP_INDISPONIVEL';
    };
