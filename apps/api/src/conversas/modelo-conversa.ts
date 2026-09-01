export interface ConversaPersistida {
  readonly id: string;
  readonly contatoId: string;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;
  readonly ultimaAtividadeEm: Date;
  readonly versao: number;
}

export interface ParticipacaoContaConversaPersistida {
  readonly conversaId: string;
  readonly contaWhatsAppId: string;
  readonly primeiraInteracaoEm: Date;
  readonly ultimaInteracaoEm: Date;
  readonly versao: number;
}

export interface EntradaResolucaoConversa {
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly interacaoEm: Date;
}

export interface ResultadoResolucaoConversa {
  readonly conversa: ConversaPersistida;
  readonly participacao: ParticipacaoContaConversaPersistida;
  readonly conversaCriada: boolean;
  readonly origemRegistrada: boolean;
}
