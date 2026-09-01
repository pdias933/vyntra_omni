export interface ContextoOrdemServicoErp {
  readonly atendimentoId: string;
  readonly filaId: string;
  readonly clienteExternoId: string;
  readonly contratoExternoId: string;
  readonly protocoloOficial: string;
}

export interface ConteudoOrdemServicoErp {
  readonly assunto: string;
  readonly descricao: string;
}

export interface EntradaCriacaoOrdemServicoErp
  extends ContextoOrdemServicoErp,
    ConteudoOrdemServicoErp {
  readonly chaveIdempotencia: string;
  readonly confirmacaoExplicita: true;
  readonly proximaAcaoEm: Date;
  readonly duracaoConcessaoMs?: number;
}

export interface EntradaAtualizacaoOrdemServicoErp
  extends EntradaCriacaoOrdemServicoErp {
  readonly ordemServicoId: string;
  readonly versaoEsperada: number;
}

export interface OrdemServicoErpPersistida {
  readonly atendimentoId: string;
  readonly clienteExternoId: string;
  readonly contratoExternoId: string;
  readonly protocoloOficial: string;
  readonly id: string;
  readonly operacaoCriacaoId: string;
  readonly ordemServicoExternaId: string;
  readonly versao: number;
  readonly confirmadoEm: Date;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface AtualizacaoOrdemServicoErpPersistida {
  readonly confirmadoEm: Date;
  readonly ordemServicoId: string;
  readonly versaoResultante: number;
}

export type SituacaoOperacaoOrdemServicoErp =
  | 'AGUARDANDO_NOVA_TENTATIVA'
  | 'ATUALIZACAO_CONCORRENTE'
  | 'CONCLUIDA'
  | 'FALHA_DEFINITIVA'
  | 'PROCESSAMENTO_EM_CURSO'
  | 'RECONCILIACAO_NECESSARIA'
  | 'VERSAO_DESATUALIZADA';

export interface ResultadoOperacaoOrdemServicoErp {
  readonly situacao: SituacaoOperacaoOrdemServicoErp;
  readonly operacaoId: string;
  readonly ordemServicoId?: string;
  readonly ordemServicoExternaId?: string;
  readonly versao?: number;
  readonly confirmadoEm?: Date;
}
