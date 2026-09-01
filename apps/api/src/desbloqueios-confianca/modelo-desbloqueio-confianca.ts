export interface EntradaVerificacaoDesbloqueioConfianca {
  readonly atendimentoId: string;
  readonly contratoExternoId: string;
  readonly filaId: string;
}

export interface UltimoDesbloqueioConfianca {
  readonly confirmadoEm: Date;
}

export interface EntradaExecucaoDesbloqueioConfianca
  extends EntradaVerificacaoDesbloqueioConfianca {
  readonly chaveIdempotencia: string;
  readonly confirmacaoExplicita: true;
  readonly proximaAcaoEm: Date;
  readonly duracaoConcessaoMs?: number;
}

export type SituacaoExecucaoDesbloqueioConfianca =
  | 'AGUARDANDO_NOVA_TENTATIVA'
  | 'CONCLUIDO'
  | 'DESBLOQUEIO_CONCORRENTE'
  | 'FALHA_DEFINITIVA'
  | 'INELEGIVEL'
  | 'INTEGRACAO_INDISPONIVEL'
  | 'PROCESSAMENTO_EM_CURSO'
  | 'RECONCILIACAO_NECESSARIA'
  | 'RECURSO_NAO_ENCONTRADO';

export interface ResultadoExecucaoDesbloqueioConfianca {
  readonly situacao: SituacaoExecucaoDesbloqueioConfianca;
  readonly operacaoId?: string;
  readonly confirmadoEm?: Date;
  readonly motivos?: readonly MotivoInelegibilidadeDesbloqueioConfianca[];
  readonly codigo?: 'CAPACIDADE_NAO_HABILITADA' | 'ERP_INDISPONIVEL';
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
