import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AtualizacaoOrdemServicoErpPersistida,
  ContextoOrdemServicoErp,
  OrdemServicoErpPersistida,
} from './modelo-ordem-servico.js';

export const REPOSITORIO_ORDENS_SERVICO = Symbol(
  'REPOSITORIO_ORDENS_SERVICO',
);

export interface NovaOrdemServicoErp extends OrdemServicoErpPersistida {
  readonly assunto: string;
  readonly descricao: string;
  readonly descricaoHash: string;
}

export interface NovaAtualizacaoOrdemServicoErp {
  readonly assunto: string;
  readonly confirmadoEm: Date;
  readonly conteudoHash: string;
  readonly descricaoHash: string;
  readonly descricao: string;
  readonly operacaoId: string;
  readonly ordemServicoId: string;
  readonly versaoEsperada: number;
}

export interface RepositorioOrdensServico {
  contextoEProtocoloCorrespondem(
    contexto: ContextoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  obterPorOperacaoCriacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<OrdemServicoErpPersistida | undefined>;

  criar(
    ordem: NovaOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  bloquearOrdem(
    ordemServicoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  obterNoContexto(
    ordemServicoId: string,
    contexto: ContextoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<OrdemServicoErpPersistida | undefined>;

  reservarAtualizacao(
    ordemServicoId: string,
    operacaoId: string,
    versaoEsperada: number,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  reservaAtualizacaoPertence(
    ordemServicoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  liberarReservaAtualizacao(
    ordemServicoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  confirmarAtualizacao(
    atualizacao: NovaAtualizacaoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  obterAtualizacaoPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtualizacaoOrdemServicoErpPersistida | undefined>;
}
