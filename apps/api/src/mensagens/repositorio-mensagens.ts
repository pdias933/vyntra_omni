import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSaidaMensagemAutomatica,
  ContextoSaidaMensagem,
  MensagemAutomaticaParaDespacho,
  MensagemSaidaPersistida,
} from './modelo-mensagem.js';

export const REPOSITORIO_MENSAGENS = Symbol('REPOSITORIO_MENSAGENS');

export interface RepositorioMensagens {
  bloquearAutoridadeSaida(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
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
  modeloAprovado(
    modeloId: string,
    contaWhatsAppId: string,
    quantidadeParametros: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterAutomaticaParaDespacho(
    mensagemId: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemAutomaticaParaDespacho | undefined>;
  atualizarAutomaticaCondicional(
    mensagem: MensagemSaidaPersistida,
    estadoEsperado: MensagemSaidaPersistida['estadoSaida'],
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  acrescentar(
    mensagem: MensagemSaidaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
