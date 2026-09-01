import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  FluxoPersistido,
  HistoricoPublicacaoFluxoPersistido,
  VersaoFluxoPersistida,
} from './modelo-fluxo.js';

export const REPOSITORIO_FLUXOS = Symbol('REPOSITORIO_FLUXOS');

export interface RepositorioFluxos {
  bloquearNome(nomeNormalizado: string, transacao: TransacaoPrisma): Promise<void>;
  bloquearFluxo(fluxoId: string, transacao: TransacaoPrisma): Promise<void>;
  bloquearVersao(versaoFluxoId: string, transacao: TransacaoPrisma): Promise<void>;
  criarFluxo(fluxo: FluxoPersistido, transacao: TransacaoPrisma): Promise<boolean>;
  criarVersao(
    versao: VersaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterFluxo(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<FluxoPersistido | undefined>;
  obterVersao(
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida | undefined>;
  obterProximoNumeroVersao(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  alterarRascunho(
    versao: VersaoFluxoPersistida,
    revisaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterVersaoPublicada(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida | undefined>;
  publicarVersao(
    versaoFluxoId: string,
    fluxoId: string,
    publicadaPorUsuarioId: string,
    publicadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  arquivarVersao(
    versaoFluxoId: string,
    fluxoId: string,
    atualizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  reativarVersaoArquivada(
    versaoFluxoId: string,
    fluxoId: string,
    atualizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  alterarPonteiroPublicado(
    fluxoId: string,
    revisaoEsperada: number,
    versaoAnteriorId: string | undefined,
    versaoNovaId: string | undefined,
    atualizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  registrarHistoricoPublicacao(
    historico: HistoricoPublicacaoFluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  marcarVersaoEmTeste(
    versaoFluxoId: string,
    fluxoId: string,
    revisaoEsperada: number,
    atualizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
