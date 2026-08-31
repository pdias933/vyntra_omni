import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ItemCaixaSaida } from './modelo-eventos.js';

export const REPOSITORIO_CAIXA_SAIDA = Symbol('REPOSITORIO_CAIXA_SAIDA');

export interface RepositorioCaixaSaida {
  acrescentar(
    item: ItemCaixaSaida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
