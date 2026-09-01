import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const REPOSITORIO_ATRIBUICOES_ATENDIMENTO = Symbol(
  'REPOSITORIO_ATRIBUICOES_ATENDIMENTO',
);

export interface RepositorioAtribuicoesAtendimento {
  obter(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtendimentoPersistido | undefined>;
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
}
