import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { PassoExecucaoFluxoPersistido } from './modelo-passo-execucao-fluxo.js';

export const REPOSITORIO_PASSOS_EXECUCAO_FLUXO = Symbol(
  'REPOSITORIO_PASSOS_EXECUCAO_FLUXO',
);

export interface RepositorioPassosExecucaoFluxo {
  iniciar(
    passo: PassoExecucaoFluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  finalizar(
    passo: PassoExecucaoFluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
