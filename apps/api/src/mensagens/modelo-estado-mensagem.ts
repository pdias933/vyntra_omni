import type { MensagemSaidaPersistida } from './modelo-mensagem.js';

export const ESTADOS_EVENTO_MENSAGEM = [
  'ENVIADA',
  'ENTREGUE',
  'LIDA',
  'FALHOU',
] as const;

export type EstadoEventoMensagem = (typeof ESTADOS_EVENTO_MENSAGEM)[number];

export interface EventoEstadoMensagemNormalizado {
  readonly contaWhatsAppId: string;
  readonly identificadorMensagemExterno: string;
  readonly identificadorEventoExterno: string;
  readonly estado: EstadoEventoMensagem;
  readonly ocorridoEm: Date;
  readonly codigoFalha?: string;
}

export interface RecepcaoEstadoMensagem {
  readonly id: string;
  readonly mensagemId: string;
  readonly contaWhatsAppId: string;
  readonly identificadorEventoExterno: string;
  readonly estado: EstadoEventoMensagem;
  readonly codigoFalha?: string;
  readonly ocorridoEm: Date;
  readonly recebidoEm: Date;
  readonly aplicado: boolean;
  readonly aplicadoEm?: Date;
}

export type ResultadoEstadoMensagem =
  | { readonly resultado: 'MENSAGEM_DESCONHECIDA' }
  | { readonly resultado: 'DUPLICADO'; readonly mensagem: MensagemSaidaPersistida }
  | { readonly resultado: 'IGNORADO_POR_ESTADO'; readonly mensagem: MensagemSaidaPersistida }
  | { readonly resultado: 'APLICADO'; readonly mensagem: MensagemSaidaPersistida };
