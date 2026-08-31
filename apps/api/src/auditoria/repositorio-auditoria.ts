import type { RegistroAuditoria } from './modelo-auditoria.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const REPOSITORIO_AUDITORIA = Symbol('REPOSITORIO_AUDITORIA');

export interface RepositorioAuditoria {
  acrescentar(
    registro: RegistroAuditoria,
    transacao?: TransacaoPrisma,
  ): Promise<void>;
}
