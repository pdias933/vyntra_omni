export const FILTROS_ATENDIMENTOS_WEB = [
  'MEUS',
  'PENDENTES',
  'NAO_LIDOS',
  'SLA',
  'EXPIRANDO',
  'EM_AUTOMACAO',
] as const;

export type FiltroAtendimentosWeb = (typeof FILTROS_ATENDIMENTOS_WEB)[number];

export interface ResumoAtendimentoWeb {
  readonly atendimentoId: string;
  readonly conversaId: string;
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly nomeContato: string;
  readonly identidadeSecundaria?: string;
  readonly filaId: string;
  readonly filaNome: string;
  readonly modo: 'BOT' | 'HUMANO';
  readonly estado: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  readonly ultimaAtividadeEm: Date;
  readonly ultimaMensagemResumo: string;
  readonly ultimaMensagemDirecao?: 'ENTRADA' | 'SAIDA';
  readonly quantidadeNaoLida: number;
  readonly slaEm?: Date;
  readonly janelaExpiraEm?: Date;
}

export type TipoItemTimelineWeb =
  | 'EVENTO_OPERACIONAL'
  | 'FORMULARIO'
  | 'MENSAGEM'
  | 'NOTA_INTERNA'
  | 'SEPARADOR_ATENDIMENTO';

export interface ItemTimelineWeb {
  readonly id: string;
  readonly tipo: TipoItemTimelineWeb;
  readonly ocorridoEm: Date;
  readonly atendimentoId: string;
  readonly contaWhatsAppNome?: string;
  readonly direcao?: 'ENTRADA' | 'SAIDA';
  readonly estadoMensagem?: string;
  readonly mensagemTipo?: string;
  readonly texto?: string;
  readonly rotulo?: string;
  readonly somenteEquipe?: boolean;
}

export interface MarcadorLeituraWeb {
  readonly ultimaMensagemLidaId?: string;
  readonly marcadaNaoLida: boolean;
  readonly versao: number;
}

export interface PaginaTimelineWeb {
  readonly itens: readonly ItemTimelineWeb[];
  readonly marcador: MarcadorLeituraWeb;
  readonly proximoCursor?: string;
}
