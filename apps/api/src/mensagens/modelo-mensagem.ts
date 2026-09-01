import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const ESTADOS_SAIDA_MENSAGEM = [
  'NA_FILA',
  'ENVIANDO',
  'ENVIADA',
  'ENTREGUE',
  'LIDA',
  'FALHOU',
  'CANCELADA',
] as const;

export type EstadoSaidaMensagemDominio =
  (typeof ESTADOS_SAIDA_MENSAGEM)[number];

export interface MensagemSaidaPersistida {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly contaWhatsAppId: string;
  readonly direcao: 'SAIDA';
  readonly tipo: 'TEXTO';
  readonly estadoSaida: EstadoSaidaMensagemDominio;
  readonly conteudoProtegido: ObjetoJsonProtegido;
  readonly conteudoHash: string;
  readonly identificadorExternoMensagem: string | undefined;
  readonly mensagemClienteId: string;
  readonly usuarioRemetenteId: string;
  readonly contatoRemetenteId: undefined;
  readonly criadaDispositivoEm: Date | undefined;
  readonly recebidaServidorEm: Date;
  readonly proximaTentativaEm: Date | undefined;
  readonly tentativasEnvio: number;
  readonly enviadaEm: Date | undefined;
  readonly entregueEm: Date | undefined;
  readonly lidaEm: Date | undefined;
  readonly falhouEm: Date | undefined;
  readonly canceladaEm: Date | undefined;
  readonly codigoFalha: string | undefined;
  readonly versao: number;
}

export interface ContextoSaidaMensagem {
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly filaId: string;
  readonly permiteEnvio: boolean;
}
