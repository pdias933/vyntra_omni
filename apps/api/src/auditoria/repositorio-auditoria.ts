import type { RegistroAuditoria } from './modelo-auditoria.js';

export const REPOSITORIO_AUDITORIA = Symbol('REPOSITORIO_AUDITORIA');

export interface RepositorioAuditoria {
  acrescentar(registro: RegistroAuditoria): Promise<void>;
}
