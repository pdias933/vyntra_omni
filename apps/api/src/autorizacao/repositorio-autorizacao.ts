import type { ContextoUsuarioAutorizacao } from './modelo-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const REPOSITORIO_AUTORIZACAO = Symbol('REPOSITORIO_AUTORIZACAO');

export interface RepositorioAutorizacao {
  obterContexto(
    usuarioId: string,
    filaId?: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContextoUsuarioAutorizacao | undefined>;
}
