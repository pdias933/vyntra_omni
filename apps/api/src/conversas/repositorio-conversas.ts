import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ConversaPersistida,
  ParticipacaoContaConversaPersistida,
} from './modelo-conversa.js';

export const REPOSITORIO_CONVERSAS = Symbol('REPOSITORIO_CONVERSAS');

export interface RepositorioConversas {
  bloquearContato(contatoId: string, transacao: TransacaoPrisma): Promise<void>;
  contatoExiste(contatoId: string, transacao: TransacaoPrisma): Promise<boolean>;
  contaEstaAtiva(
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterPorContato(
    contatoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ConversaPersistida | undefined>;
  criar(
    conversa: ConversaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizar(
    conversa: ConversaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterParticipacao(
    conversaId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<ParticipacaoContaConversaPersistida | undefined>;
  criarParticipacao(
    participacao: ParticipacaoContaConversaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarParticipacao(
    participacao: ParticipacaoContaConversaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
