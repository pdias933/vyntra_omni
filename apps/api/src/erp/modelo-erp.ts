export type OrigemConsultaErp = 'TEMPO_REAL';

export interface CriteriosLocalizacaoClienteErp {
  readonly clienteExternoId?: string;
  readonly documento?: string;
  readonly nome?: string;
  readonly telefone?: string;
}

export interface ClienteErpNormalizado {
  readonly clienteExternoId: string;
  readonly nomeExibicao: string;
  readonly documentoMascarado?: string;
  readonly telefoneMascarado?: string;
}

export interface ContratoErpNormalizado {
  readonly contratoExternoId: string;
  readonly clienteExternoId: string;
  readonly situacao: 'ATIVO' | 'ENCERRADO' | 'SUSPENSO' | 'DESCONHECIDO';
  readonly servico?: string;
  readonly enderecoResumido?: string;
}

export interface FaturaErpNormalizada {
  readonly faturaExternaId: string;
  readonly contratoExternoId: string;
  readonly situacao: 'ABERTA' | 'CANCELADA' | 'PAGA' | 'VENCIDA';
  readonly valorCentavos: number;
  readonly vencimento: string;
}

export interface DocumentoFaturaErpNormalizado {
  readonly faturaExternaId: string;
  readonly nomeArquivo: string;
  readonly tipoArquivo: 'PDF';
  readonly conteudo: Uint8Array;
}

export interface DadosPagamentoFaturaErpNormalizados {
  readonly faturaExternaId: string;
  readonly pixCopiaCola?: string;
  readonly linhaDigitavel?: string;
}

export interface ElegibilidadeDesbloqueioErpNormalizada {
  readonly contratoExternoId: string;
  readonly elegivel: boolean;
}

export type ResultadoElegibilidadeDesbloqueioErp =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: OrigemConsultaErp;
      readonly item: ElegibilidadeDesbloqueioErpNormalizada;
    }
  | {
      readonly resultado: 'NAO_ENCONTRADO';
      readonly origem: OrigemConsultaErp;
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'CAPACIDADE_NAO_HABILITADA' | 'ERP_INDISPONIVEL';
    };

export type ResultadoComplementoFaturaErp<T> =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: OrigemConsultaErp;
      readonly item: T;
    }
  | {
      readonly resultado: 'NAO_ENCONTRADO';
      readonly origem: OrigemConsultaErp;
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'CAPACIDADE_NAO_HABILITADA' | 'ERP_INDISPONIVEL';
    };

export type ResultadoConsultaErp<T> =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: OrigemConsultaErp;
      readonly itens: readonly T[];
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
    };

export type ResultadoConsultaUnicaErp<T> =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: OrigemConsultaErp;
      readonly item: T;
    }
  | {
      readonly resultado: 'NAO_ENCONTRADO';
      readonly origem: OrigemConsultaErp;
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
    };

export interface ComandoCriarAtendimentoErp {
  readonly atendimentoId: string;
  readonly chaveIdempotencia: string;
  readonly iniciadoEm: Date;
  readonly assunto: string;
  readonly clienteExternoId?: string;
  readonly contratoExternoId?: string;
}

export type ResultadoCriacaoAtendimentoErp =
  | {
      readonly resultado: 'CONFIRMADO';
      readonly protocoloOficial: string;
      readonly confirmadoEm: Date;
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
      readonly efeitoExternoPossivel: false;
    }
  | {
      readonly resultado: 'RESULTADO_INCERTO';
      readonly codigo: 'RESPOSTA_PERDIDA';
      readonly requerReconciliacao: true;
    };

export interface ComandoReconciliarAtendimentoErp {
  readonly atendimentoId: string;
  readonly chaveIdempotencia: string;
}

export type ResultadoReconciliacaoAtendimentoErp =
  | {
      readonly resultado: 'CONFIRMADO';
      readonly protocoloOficial: string;
      readonly confirmadoEm: Date;
    }
  | {
      readonly resultado: 'EFEITO_AUSENTE';
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
    };

export interface ComandoExecutarDesbloqueioConfiancaErp {
  readonly atendimentoId: string;
  readonly contratoExternoId: string;
  readonly chaveIdempotencia: string;
}

export type ResultadoExecucaoDesbloqueioConfiancaErp =
  | {
      readonly resultado: 'CONFIRMADO';
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
      readonly efeitoExternoPossivel: false;
    }
  | {
      readonly resultado: 'RESULTADO_INCERTO';
      readonly codigo: 'RESPOSTA_PERDIDA';
      readonly requerReconciliacao: true;
    };

export interface ComandoReconciliarDesbloqueioConfiancaErp {
  readonly atendimentoId: string;
  readonly contratoExternoId: string;
  readonly chaveIdempotencia: string;
}

export type ResultadoReconciliacaoDesbloqueioConfiancaErp =
  | {
      readonly resultado: 'CONFIRMADO';
    }
  | {
      readonly resultado: 'EFEITO_AUSENTE';
    }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'ERP_INDISPONIVEL';
    };
