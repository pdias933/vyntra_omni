export const CODIGO_CONTROLE_SESSAO_ACESSO = 'SESSAO_ACESSO';

export type EstadoSessaoAcesso = 'ATIVA' | 'INATIVA' | 'DESCONHECIDA';

export type EstadoFonteSessaoAcesso =
  | 'DESATIVADO'
  | 'DISPONIVEL'
  | 'INDISPONIVEL'
  | 'NAO_CONFIGURADO';

export interface SessaoAcessoNormalizada {
  readonly sessaoId: string;
  readonly contratoExternoId: string;
  readonly estado: EstadoSessaoAcesso;
  readonly origemDado: 'TEMPO_REAL';
  readonly obtidaEm: Date;
  readonly conexaoExternaId?: string;
  readonly nomeUsuario?: string;
  readonly enderecoIp?: string;
  readonly iniciadaEm?: Date;
  readonly duracaoSegundos?: number;
}

export interface FiltroSessoesAcesso {
  readonly contratoExternoId: string;
  readonly conexaoExternaId?: string;
  readonly nomeUsuario?: string;
}

export type ResultadoListaSessoesAcesso =
  | {
      readonly resultado: 'SUCESSO';
      readonly sessoes: readonly SessaoAcessoNormalizada[];
    }
  | ResultadoFonteSessaoAcesso;

export type ResultadoConsultaSessaoAcesso =
  | {
      readonly resultado: 'SUCESSO';
      readonly sessao?: SessaoAcessoNormalizada;
    }
  | ResultadoFonteSessaoAcesso;

export type ResultadoFonteSessaoAcesso =
  | { readonly resultado: 'DESATIVADO' }
  | { readonly resultado: 'NAO_CONFIGURADO' }
  | {
      readonly resultado: 'INDISPONIVEL';
      readonly codigo: 'FONTE_SESSAO_ACESSO_INDISPONIVEL';
    };

export interface ComandoDesconectarSessaoAcesso {
  readonly sessaoId: string;
  readonly chaveIdempotencia: string;
  readonly motivo: string;
}

export type ResultadoDesconexaoSessaoAcesso =
  | {
      readonly resultado: 'CONFIRMADA';
      readonly confirmadaEm: Date;
    }
  | { readonly resultado: 'SESSAO_NAO_ENCONTRADA' }
  | { readonly resultado: 'JA_INATIVA' }
  | { readonly resultado: 'ESTADO_NAO_PERMITE' }
  | {
      readonly resultado: 'RESULTADO_INCERTO';
      readonly codigo: 'RESPOSTA_PERDIDA';
      readonly requerReconciliacao: true;
    }
  | ResultadoFonteSessaoAcesso;

export interface ComandoReconciliarDesconexaoSessaoAcesso {
  readonly sessaoId: string;
  readonly chaveIdempotencia: string;
}

export type ResultadoReconciliacaoDesconexaoSessaoAcesso =
  | {
      readonly resultado: 'CONFIRMADA';
      readonly confirmadaEm: Date;
    }
  | { readonly resultado: 'EFEITO_AUSENTE' }
  | ResultadoFonteSessaoAcesso;
