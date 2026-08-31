import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { NovoEventoDominio } from './modelo-eventos.js';

export const REPOSITORIO_EVENTO_DOMINIO = Symbol('REPOSITORIO_EVENTO_DOMINIO');

export interface RepositorioEventoDominio {
  acrescentar(
    evento: NovoEventoDominio,
    transacao: TransacaoPrisma,
  ): Promise<bigint>;
}
