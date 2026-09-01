import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ComposicaoSegundaVia } from './segunda-via.js';

export const REPOSITORIO_COMPOSICOES_SEGUNDA_VIA = Symbol(
  'REPOSITORIO_COMPOSICOES_SEGUNDA_VIA',
);

export interface RepositorioComposicoesSegundaVia {
  acrescentar(
    composicao: ComposicaoSegundaVia,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
