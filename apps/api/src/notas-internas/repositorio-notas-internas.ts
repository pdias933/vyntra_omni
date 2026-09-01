import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { NotaInternaPersistida } from './modelo-nota-interna.js';

export const REPOSITORIO_NOTAS_INTERNAS = Symbol('REPOSITORIO_NOTAS_INTERNAS');

export interface RepositorioNotasInternas {
  contextoPermiteNota(
    conversaId: string,
    atendimentoId: string,
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  acrescentar(
    nota: NotaInternaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
