import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { UltimoDesbloqueioConfianca } from './modelo-desbloqueio-confianca.js';

export const REPOSITORIO_DESBLOQUEIOS_CONFIANCA = Symbol(
  'REPOSITORIO_DESBLOQUEIOS_CONFIANCA',
);

export interface RepositorioDesbloqueiosConfianca {
  contextoAtivoCorresponde(
    atendimentoId: string,
    filaId: string,
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  obterUltimoConfirmado(
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<UltimoDesbloqueioConfianca | undefined>;
}
