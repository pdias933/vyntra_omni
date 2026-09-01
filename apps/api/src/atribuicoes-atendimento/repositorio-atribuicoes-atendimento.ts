import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const REPOSITORIO_ATRIBUICOES_ATENDIMENTO = Symbol(
  'REPOSITORIO_ATRIBUICOES_ATENDIMENTO',
);

export interface RepositorioAtribuicoesAtendimento {
  bloquearParaFluxo(
    atendimentoId: string,
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  filaEstaAtiva(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obter(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtendimentoPersistido | undefined>;
  obterParaFluxo(
    atendimentoId: string,
    execucaoFluxoId: string,
    fluxoId: string,
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtendimentoPersistido | undefined>;
  encaminharParaFilaPorFluxoCondicional(
    proximo: AtendimentoPersistido,
    execucaoFluxoId: string,
    fluxoId: string,
    versaoFluxoId: string,
    versaoEstadoEsperada: number,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  encerrarPorFluxoCondicional(
    proximo: AtendimentoPersistido,
    execucaoFluxoId: string,
    fluxoId: string,
    versaoFluxoId: string,
    versaoEstadoEsperada: number,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  resgatarCondicional(
    proximo: AtendimentoPersistido,
    filaEsperadaId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  transferirParaFilaCondicional(
    proximo: AtendimentoPersistido,
    filaOrigemEsperadaId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  destinatarioEstaDisponivel(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  transferirParaUsuarioCondicional(
    proximo: AtendimentoPersistido,
    filaOrigemEsperadaId: string,
    filaDestinoId: string,
    destinatarioId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  assumirCondicional(
    proximo: AtendimentoPersistido,
    filaEsperadaId: string,
    responsavelAnteriorEsperadoId: string | undefined,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  usuarioTemAutoridadeAtual(
    atendimentoId: string,
    usuarioId: string,
    versaoAtribuicao: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
