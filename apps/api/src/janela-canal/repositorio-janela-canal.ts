import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlertaJanelaCanalEmitido,
  JanelaCanalPersistida,
} from './modelo-janela-canal.js';

export const REPOSITORIO_JANELA_CANAL = Symbol('REPOSITORIO_JANELA_CANAL');

export interface RepositorioJanelaCanal {
  bloquear(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  alvosValidos(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obter(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<JanelaCanalPersistida | undefined>;
  criar(
    janela: JanelaCanalPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarSeEntradaMaisNova(
    janela: JanelaCanalPersistida,
    ultimaEntradaAnterior: Date,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  registrarAlerta(
    alerta: AlertaJanelaCanalEmitido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
