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
