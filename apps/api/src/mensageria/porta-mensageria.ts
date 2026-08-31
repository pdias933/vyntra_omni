import type {
  ComandoEnvioMensagem,
  EventoRecebidoMensageria,
  ResultadoEnvioMensagem,
  ResultadoProcessamentoEventoMensageria,
} from './modelo-mensageria.js';

export const CANAL_MENSAGERIA = Symbol('CANAL_MENSAGERIA');

export interface CanalMensageria {
  enviar(comando: ComandoEnvioMensagem): Promise<ResultadoEnvioMensagem>;
}

export interface ConsumidorEventosMensageria {
  receber(
    evento: EventoRecebidoMensageria,
  ): Promise<ResultadoProcessamentoEventoMensageria>;
}
