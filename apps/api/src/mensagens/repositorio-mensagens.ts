import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSaidaMensagemAutomatica,
  ContextoSaidaMensagem,
  MensagemSaidaPersistida,
} from './modelo-mensagem.js';

export const REPOSITORIO_MENSAGENS = Symbol('REPOSITORIO_MENSAGENS');

export interface RepositorioMensagens {
  bloquearIdempotencia(
    usuarioId: string,
    mensagemClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterPorIdempotencia(
    usuarioId: string,
    mensagemClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemSaidaPersistida | undefined>;
  obterContextoSaida(
    conversaId: string,
    atendimentoId: string,
    contaWhatsAppId: string,
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSaidaMensagem | undefined>;
  obterContextoSaidaAutomatica(
    execucaoFluxoId: string,
    atendimentoId: string,
    revisaoExecucao: number,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSaidaMensagemAutomatica | undefined>;
  acrescentar(
    mensagem: MensagemSaidaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
