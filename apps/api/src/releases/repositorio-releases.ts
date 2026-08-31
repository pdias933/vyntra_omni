import type { PlataformaMobile } from '../autenticacao/modelo-autenticacao-mobile.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoControlesRecursoUsuario,
  ControleRecursoPersistido,
  EstadoControleRecurso,
  PoliticaVersaoMobilePersistida,
} from './modelo-releases.js';

export const REPOSITORIO_RELEASES = Symbol('REPOSITORIO_RELEASES');

export interface RepositorioReleases {
  listarControles(
    transacao?: TransacaoPrisma,
  ): Promise<readonly ControleRecursoPersistido[]>;
  obterContextoControlesUsuario(
    usuarioId: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContextoControlesRecursoUsuario | undefined>;
  obterControle(
    codigo: string,
    transacao: TransacaoPrisma,
  ): Promise<ControleRecursoPersistido | undefined>;
  serializarControle(
    codigo: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  alvosAtivosExistem(
    usuarios: readonly string[],
    filas: readonly string[],
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  criarControle(
    entrada: {
      readonly id: string;
      readonly codigo: string;
      readonly estado: EstadoControleRecurso;
      readonly desligadoEmergencialmente: boolean;
      readonly liberarAdministradores: boolean;
      readonly percentualLiberacao: number;
      readonly usuariosAlvo: readonly string[];
      readonly filasAlvo: readonly string[];
    },
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarControle(
    entrada: {
      readonly id: string;
      readonly versaoEsperada: number;
      readonly estado: EstadoControleRecurso;
      readonly desligadoEmergencialmente: boolean;
      readonly liberarAdministradores: boolean;
      readonly percentualLiberacao: number;
      readonly usuariosAlvo: readonly string[];
      readonly filasAlvo: readonly string[];
    },
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  listarPoliticas(
    transacao?: TransacaoPrisma,
  ): Promise<readonly PoliticaVersaoMobilePersistida[]>;
  obterPolitica(
    plataforma: PlataformaMobile,
    transacao?: TransacaoPrisma,
  ): Promise<PoliticaVersaoMobilePersistida | undefined>;
  serializarPolitica(
    plataforma: PlataformaMobile,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarPolitica(
    entrada: {
      readonly plataforma: PlataformaMobile;
      readonly versaoEsperada: number;
      readonly versaoMinima: string;
      readonly versaoRecomendada: string;
      readonly mensagem?: string;
      readonly urlLoja?: string;
    },
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
