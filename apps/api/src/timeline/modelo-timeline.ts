import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const TIPOS_ITEM_TIMELINE = [
  'MENSAGEM',
  'NOTA_INTERNA',
  'EVENTO_OPERACIONAL',
  'FORMULARIO',
  'SEPARADOR_ATENDIMENTO',
] as const;

interface ItemTimelineBase {
  readonly id: string;
  readonly ocorridoEm: Date;
  readonly sequenciaEvento: bigint;
}

export interface MensagemTimeline extends ItemTimelineBase {
  readonly tipo: 'MENSAGEM';
  readonly mensagemId: string;
  readonly direcao: 'ENTRADA' | 'SAIDA';
  readonly contaWhatsAppOrigemId: string;
}

export interface NotaInternaTimeline extends ItemTimelineBase {
  readonly tipo: 'NOTA_INTERNA';
  readonly notaInternaId: string;
  readonly autorUsuarioId: string;
  readonly conteudoProtegido: ObjetoJsonProtegido;
  readonly visibilidade: 'SOMENTE_EQUIPE';
}

export interface EventoOperacionalTimeline extends ItemTimelineBase {
  readonly tipo: 'EVENTO_OPERACIONAL';
  readonly eventoDominioId: string;
  readonly codigoEvento: string;
  readonly rotulo: string;
  readonly visibilidade: 'SOMENTE_EQUIPE';
}

export interface FormularioTimeline extends ItemTimelineBase {
  readonly tipo: 'FORMULARIO';
  readonly acao: 'VER_FORMULARIO';
  readonly submissaoFormularioId: string;
  readonly nomeFormulario: string;
  readonly camposMascarados: Readonly<Record<string, string>>;
  readonly visibilidade: 'SOMENTE_EQUIPE';
}

export interface SeparadorAtendimentoTimeline extends ItemTimelineBase {
  readonly tipo: 'SEPARADOR_ATENDIMENTO';
  readonly atendimentoId: string;
  readonly contaWhatsAppOrigemId: string;
  readonly rotulo: string;
}

export type ItemTimeline =
  | MensagemTimeline
  | NotaInternaTimeline
  | EventoOperacionalTimeline
  | FormularioTimeline
  | SeparadorAtendimentoTimeline;

export interface FontesTimeline {
  readonly mensagens: readonly MensagemTimeline[];
  readonly notasInternas: readonly NotaInternaTimeline[];
  readonly eventosOperacionais: readonly EventoOperacionalTimeline[];
  readonly formularios: readonly FormularioTimeline[];
  readonly separadoresAtendimento: readonly SeparadorAtendimentoTimeline[];
}
