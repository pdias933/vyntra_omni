import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContatoPersistido,
  IdentidadeWhatsAppPersistida,
} from './modelo-contato.js';

export const REPOSITORIO_CONTATOS = Symbol('REPOSITORIO_CONTATOS');

export interface RepositorioContatos {
  bloquearIdentidade(
    portfolioEmpresarialExternoId: string,
    identificadorExternoEstavel: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  obterPorIdentificadorEstavel(
    portfolioEmpresarialExternoId: string,
    identificadorExternoEstavel: string,
    transacao: TransacaoPrisma,
  ): Promise<
    | {
        readonly contato: ContatoPersistido;
        readonly identidade: IdentidadeWhatsAppPersistida;
      }
    | undefined
  >;

  criar(
    contato: ContatoPersistido,
    identidade: IdentidadeWhatsAppPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
