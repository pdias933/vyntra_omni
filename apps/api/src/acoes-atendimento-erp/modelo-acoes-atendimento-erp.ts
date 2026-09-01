import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';

export interface ContextoAcaoAtendimentoErp {
  readonly atendimentoId: string;
  readonly filaId: string;
  readonly protocoloOficial: string;
}

export interface EntradaComentarioAtendimentoErp
  extends ContextoAcaoAtendimentoErp {
  readonly chaveIdempotencia: string;
  readonly comentario: string;
  readonly confirmacaoExplicita: true;
  readonly proximaAcaoEm: Date;
  readonly duracaoConcessaoMs?: number;
}

export interface EntradaEncerramentoAtendimentoErp
  extends ContextoAcaoAtendimentoErp {
  readonly chaveIdempotencia: string;
  readonly confirmacaoExplicita: true;
  readonly motivo: string;
  readonly proximaAcaoEm: Date;
  readonly versaoAtribuicaoEsperada: number;
  readonly versaoEstadoEsperada: number;
  readonly duracaoConcessaoMs?: number;
}

export type TipoAcaoAtendimentoErp = 'COMENTARIO' | 'ENCERRAMENTO';

export interface RegistroAcaoAtendimentoErpPersistido {
  readonly atendimentoId: string;
  readonly confirmadoEm: Date;
  readonly operacaoId: string;
  readonly protocoloOficial: string;
  readonly tipo: TipoAcaoAtendimentoErp;
  readonly versaoAtribuicaoResultante?: number;
  readonly versaoEstadoResultante?: number;
}

export interface ContextoAtendimentoErpPersistido {
  readonly atendimento: AtendimentoPersistido;
  readonly protocoloOficial: string;
}

export type SituacaoAcaoAtendimentoErp =
  | 'AGUARDANDO_NOVA_TENTATIVA'
  | 'ATENDIMENTO_JA_ENCERRADO'
  | 'CONCLUIDA'
  | 'ENCERRAMENTO_CONCORRENTE'
  | 'FALHA_DEFINITIVA'
  | 'PROCESSAMENTO_EM_CURSO'
  | 'RECONCILIACAO_NECESSARIA'
  | 'VERSAO_DESATUALIZADA';

export interface ResultadoAcaoAtendimentoErp {
  readonly situacao: SituacaoAcaoAtendimentoErp;
  readonly operacaoId: string;
  readonly confirmadoEm?: Date;
  readonly versaoAtribuicao?: number;
  readonly versaoEstado?: number;
}

export interface ResultadoLinkTranscricaoDesativado {
  readonly situacao: 'DESATIVADO';
  readonly motivo:
    | 'APROVACAO_JURIDICA_PENDENTE'
    | 'CAPACIDADE_MK_NAO_CARACTERIZADA';
}
