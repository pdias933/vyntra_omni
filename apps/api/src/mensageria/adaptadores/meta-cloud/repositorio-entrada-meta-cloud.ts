import type { TransacaoPrisma } from '../../../persistencia/transacao-prisma.js';

export const REPOSITORIO_ENTRADA_META_CLOUD = Symbol('REPOSITORIO_ENTRADA_META_CLOUD');

export interface RecepcaoEntradaMetaCloud {
  readonly id: string;
  readonly contaWhatsAppId: string;
  readonly identificadorEventoExterno: string;
  readonly corpoHash: string;
  readonly recebidoEm: Date;
}

export interface MensagemEntradaPersistir {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly contaWhatsAppId: string;
  readonly conteudoProtegido: { readonly texto: string };
  readonly conteudoHash: string;
  readonly identificadorExternoMensagem: string;
  readonly contatoRemetenteId: string;
  readonly criadaDispositivoEm: Date;
  readonly recebidaServidorEm: Date;
}

export interface RepositorioEntradaMetaCloud {
  obterContaAtiva(identificadorCanalExterno: string, transacao: TransacaoPrisma): Promise<{ readonly id: string } | undefined>;
  registrarRecepcaoSeNova(entrada: RecepcaoEntradaMetaCloud, transacao: TransacaoPrisma): Promise<boolean>;
  obterOuCriarAtendimento(conversaId: string, contaWhatsAppId: string, agora: Date, transacao: TransacaoPrisma): Promise<{ readonly id: string; readonly criado: boolean }>;
  acrescentarMensagem(mensagem: MensagemEntradaPersistir, transacao: TransacaoPrisma): Promise<void>;
  marcarPersistida(recepcaoId: string, mensagemId: string, agora: Date, transacao: TransacaoPrisma): Promise<void>;
}
