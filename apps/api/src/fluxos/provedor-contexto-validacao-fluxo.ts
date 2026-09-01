import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { DefinicaoFluxo } from './modelo-fluxo.js';
import type { ContextoValidacaoPublicacaoFluxo } from './modelo-validacao-fluxo.js';

export const PROVEDOR_CONTEXTO_VALIDACAO_FLUXO = Symbol(
  'PROVEDOR_CONTEXTO_VALIDACAO_FLUXO',
);

export interface ProvedorContextoValidacaoFluxo {
  obter(
    definicao: DefinicaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ContextoValidacaoPublicacaoFluxo>;
}
