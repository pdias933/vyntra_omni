import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContatoPersistido,
  EntradaAlteracaoIdentidadeWhatsApp,
  IdentidadeWhatsAppPersistida,
  ResultadoAlteracaoIdentidadeWhatsApp,
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

  alterarIdentificadorConfirmado(
    identidade: IdentidadeWhatsAppPersistida,
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
    portfolioEmpresarialExternoId: string,
    eventoId: string,
    observadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  registrarEventoAlteracao(
    identidadeWhatsAppId: string,
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
    portfolioEmpresarialExternoId: string,
    resultado: ResultadoAlteracaoIdentidadeWhatsApp,
    eventoId: string,
    observadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
