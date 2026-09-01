import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ContaWhatsAppPersistida } from './modelo-conta-whatsapp.js';

export const REPOSITORIO_CONTA_WHATSAPP = Symbol(
  'REPOSITORIO_CONTA_WHATSAPP',
);

export interface RepositorioContaWhatsApp {
  criar(
    conta: ContaWhatsAppPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  listar(transacao?: TransacaoPrisma): Promise<readonly ContaWhatsAppPersistida[]>;

  obterPorId(
    contaWhatsAppId: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContaWhatsAppPersistida | undefined>;
}
