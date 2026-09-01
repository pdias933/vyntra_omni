import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  MensagemSaidaPersistida,
} from './modelo-mensagem.js';
import type { RecepcaoEstadoMensagem } from './modelo-estado-mensagem.js';

export const REPOSITORIO_ESTADOS_MENSAGEM = Symbol(
  'REPOSITORIO_ESTADOS_MENSAGEM',
);

export interface RepositorioEstadosMensagem {
  obterMensagem(
    contaWhatsAppId: string,
    identificadorMensagemExterno: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemSaidaPersistida | undefined>;
  registrarRecepcao(
    recepcao: RecepcaoEstadoMensagem,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  atualizarMensagem(
    mensagem: MensagemSaidaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  marcarAplicado(
    recepcaoId: string,
    aplicadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
