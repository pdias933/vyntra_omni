export const ESTADOS_OPERACAO_RECUPERAVEL = [
  'PENDENTE',
  'EM_EXECUCAO',
  'AGUARDANDO_NOVA_TENTATIVA',
  'RESULTADO_INCERTO',
  'EM_RECONCILIACAO',
  'CONCLUIDA',
  'FALHA_DEFINITIVA',
] as const;

export type EstadoOperacaoRecuperavel =
  (typeof ESTADOS_OPERACAO_RECUPERAVEL)[number];

export interface EntradaIdempotencia {
  readonly escopoTipo: string;
  readonly escopoId: string;
  readonly chaveIdempotencia: string;
  readonly assinaturaRequisicaoHash: string;
  readonly tipoOperacao: string;
  readonly entidadeTipo?: string;
  readonly entidadeId?: string;
}

export interface OperacaoRecuperavel {
  readonly id: string;
  readonly registroIdempotenciaId: string;
  readonly tipo: string;
  readonly entidadeTipo: string | undefined;
  readonly entidadeId: string | undefined;
  readonly estado: EstadoOperacaoRecuperavel;
  readonly tentativas: number;
  readonly versao: number;
  readonly proximaAcaoEm: Date | undefined;
  readonly codigoUltimoErro: string | undefined;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
  readonly concluidoEm: Date | undefined;
}

export interface ResultadoIdempotencia {
  readonly situacao: 'NOVA' | 'EXISTENTE';
  readonly operacao: OperacaoRecuperavel;
}

export interface ConcessaoOperacao {
  readonly operacaoId: string;
  readonly tipo: 'EXECUCAO' | 'RECONCILIACAO';
  readonly numeroTentativa: number;
  readonly tokenConcessao: string;
  readonly concedidaAte: Date;
}

export interface EntradaEncerramentoOperacao {
  readonly operacaoId: string;
  readonly tokenConcessao: string;
  readonly codigo?: string;
  readonly dados?: Readonly<Record<string, unknown>>;
  readonly proximaAcaoEm?: Date;
}
