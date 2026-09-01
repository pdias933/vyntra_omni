import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AtribuicaoAtualAtendimento,
  HistoricoAtribuicaoPersistido,
} from './modelo-historico-atribuicao.js';

export const REPOSITORIO_HISTORICO_ATRIBUICAO = Symbol(
  'REPOSITORIO_HISTORICO_ATRIBUICAO',
);

export interface RepositorioHistoricoAtribuicao {
  bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterAtribuicaoAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtribuicaoAtualAtendimento | undefined>;
  obterAberto(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<HistoricoAtribuicaoPersistido | undefined>;
  criar(
    historico: HistoricoAtribuicaoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  finalizar(
    historicoId: string,
    finalizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
