import type { ReferenciaArmazenamentoPrivado } from './modelo-midia.js';

export const PORTA_ARMAZENAMENTO_PRIVADO = Symbol('PORTA_ARMAZENAMENTO_PRIVADO');

export interface PortaArmazenamentoPrivado {
  guardar(
    chaveObjeto: string,
    conteudo: Uint8Array,
    mime: string,
  ): Promise<ReferenciaArmazenamentoPrivado>;
}
