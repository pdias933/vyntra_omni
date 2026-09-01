import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlvoContextoAtendimento,
  ContextoAtendimentoPersistido,
} from './modelo-contexto-cliente.js';

export const REPOSITORIO_CONTEXTOS_CLIENTE = Symbol(
  'REPOSITORIO_CONTEXTOS_CLIENTE',
);

export interface RepositorioContextosCliente {
  obterAlvoAtivo(
    contatoId: string,
    vinculoClienteId: string,
    vinculoContratoId: string | undefined,
    transacao: TransacaoPrisma,
  ): Promise<AlvoContextoAtendimento | undefined>;

  obterContexto(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoPersistido | undefined>;

  criar(
    contexto: ContextoAtendimentoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  alterar(
    contexto: ContextoAtendimentoPersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
