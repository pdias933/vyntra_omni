import type { EventoDominio } from '../eventos/modelo-eventos.js';
import type {
  PayloadEventoMobile,
  PayloadEventoWeb,
} from './modelo-projecao-evento.js';

export interface LimitesRetencaoEventos {
  readonly menorSequenciaRetida: bigint | undefined;
  readonly maiorSequencia: bigint;
}

export interface EventoVarridoSincronizacao {
  readonly autorizado: boolean;
  readonly evento: EventoDominio;
  readonly podeVerDadoSensivel: boolean;
}

export interface LoteSincronizacaoIncremental {
  readonly eventos: readonly (PayloadEventoMobile | PayloadEventoWeb)[];
  readonly sequenciaFinal: string;
  readonly temMais: boolean;
}
