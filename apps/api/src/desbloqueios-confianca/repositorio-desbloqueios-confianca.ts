import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { UltimoDesbloqueioConfianca } from './modelo-desbloqueio-confianca.js';

export const REPOSITORIO_DESBLOQUEIOS_CONFIANCA = Symbol(
  'REPOSITORIO_DESBLOQUEIOS_CONFIANCA',
);

export interface RepositorioDesbloqueiosConfianca {
  bloquearContrato(
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  contextoAtivoCorresponde(
    atendimentoId: string,
    filaId: string,
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  contextoAtivoCorrespondeParaFluxo(
    atendimentoId: string,
    contratoExternoId: string,
    fluxoId: string,
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  obterUltimoConfirmado(
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<UltimoDesbloqueioConfianca | undefined>;

  obterConfirmadoPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<UltimoDesbloqueioConfianca | undefined>;

  reservar(
    contratoExternoId: string,
    atendimentoId: string,
    operacaoId: string,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  reservaPertence(
    contratoExternoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  liberarReserva(
    contratoExternoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  registrarConfirmado(
    atendimentoId: string,
    contratoExternoId: string,
    operacaoId: string,
    confirmadoEm: Date,
    criadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
