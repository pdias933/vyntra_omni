export type AudienciaEventoCliente = 'MOBILE' | 'PUSH' | 'WEB';

export interface ContextoAutorizacaoProjecao {
  readonly usuarioId: string;
  readonly sessaoValida: boolean;
  readonly recursoAcessivel: boolean;
  readonly podeVerDadoPessoal: boolean;
  readonly podeVerDadoSensivel: boolean;
  readonly podeReceberPush: boolean;
}

export type ValorDadoEventoCliente = boolean | number | string | null;

interface PayloadEventoBase {
  readonly sequenciaEvento: string;
  readonly tipo: string;
  readonly entidadeTipo: string;
  readonly entidadeId: string;
  readonly atendimentoId?: string;
  readonly conversaId?: string;
  readonly ocorridoEm: string;
}

export interface PayloadEventoWeb extends PayloadEventoBase {
  readonly audiencia: 'WEB';
  readonly dados: Readonly<Record<string, ValorDadoEventoCliente>>;
}

export interface PayloadEventoMobile extends PayloadEventoBase {
  readonly audiencia: 'MOBILE';
  readonly dados: Readonly<Record<string, ValorDadoEventoCliente>>;
  readonly politicaCache: 'OPERACIONAL' | 'PROTEGIDO';
}

export interface PayloadEventoPush {
  readonly audiencia: 'PUSH';
  readonly sequenciaEvento: string;
  readonly tipoNotificacao:
    | 'CLIENTE_AGUARDANDO'
    | 'JANELA_EXPIRANDO'
    | 'NOVA_MENSAGEM'
    | 'NOVO_PENDENTE'
    | 'TRANSFERENCIA_DIRETA';
  readonly atendimentoId?: string;
  readonly conversaId?: string;
  readonly chaveAgrupamento?: string;
}

export type PayloadEventoCliente =
  | PayloadEventoMobile
  | PayloadEventoPush
  | PayloadEventoWeb;
