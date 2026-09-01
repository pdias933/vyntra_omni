import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const REPOSITORIO_INVALIDACAO_PERMISSOES = Symbol(
  'REPOSITORIO_INVALIDACAO_PERMISSOES',
);

export interface RepositorioInvalidacaoPermissoes {
  incrementarVersao(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<number | undefined>;
}
