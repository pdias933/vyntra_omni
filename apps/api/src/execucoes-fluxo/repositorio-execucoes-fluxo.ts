import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';

export const REPOSITORIO_EXECUCOES_FLUXO = Symbol(
  'REPOSITORIO_EXECUCOES_FLUXO',
);

export interface RepositorioExecucoesFluxo {
  criarSeAtendimentoAutomatizavel(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterPorId(
    execucaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ExecucaoFluxoPersistida | undefined>;
  obterAtivaPorAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ExecucaoFluxoPersistida | undefined>;
  listarRetomadasVencidas(
    limite: number,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<readonly ExecucaoFluxoPersistida[]>;
  alterarCondicional(
    proxima: ExecucaoFluxoPersistida,
    estadoEsperado: ExecucaoFluxoPersistida['estado'],
    revisaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
