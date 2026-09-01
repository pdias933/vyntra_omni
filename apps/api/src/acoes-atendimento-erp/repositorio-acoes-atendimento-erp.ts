import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoAcaoAtendimentoErp,
  ContextoAtendimentoErpPersistido,
  RegistroAcaoAtendimentoErpPersistido,
  TipoAcaoAtendimentoErp,
} from './modelo-acoes-atendimento-erp.js';

export const REPOSITORIO_ACOES_ATENDIMENTO_ERP = Symbol(
  'REPOSITORIO_ACOES_ATENDIMENTO_ERP',
);

export interface NovoRegistroAcaoAtendimentoErp {
  readonly atendimentoId: string;
  readonly confirmadoEm: Date;
  readonly conteudoHash: string;
  readonly operacaoId: string;
  readonly protocoloOficial: string;
  readonly tipo: TipoAcaoAtendimentoErp;
  readonly versaoAtribuicaoResultante?: number;
  readonly versaoEstadoResultante?: number;
}

export interface RepositorioAcoesAtendimentoErp {
  bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterNoContexto(
    contexto: ContextoAcaoAtendimentoErp,
    exigirAberto: boolean,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoErpPersistido | undefined>;
  obterPorAtendimentoEProtocolo(
    atendimentoId: string,
    protocoloOficial: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoErpPersistido | undefined>;
  obterPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<RegistroAcaoAtendimentoErpPersistido | undefined>;
  registrar(
    registro: NovoRegistroAcaoAtendimentoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  reservarEncerramento(
    atendimentoId: string,
    operacaoId: string,
    versaoEstadoEsperada: number,
    versaoAtribuicaoEsperada: number,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  reservaEncerramentoPertence(
    atendimentoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  liberarReservaEncerramento(
    atendimentoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  confirmarEncerramento(
    atual: AtendimentoPersistido,
    proximo: AtendimentoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  finalizarAtribuicaoAberta(
    atendimentoId: string,
    finalizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
