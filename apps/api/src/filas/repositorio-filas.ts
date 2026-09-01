import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AcessoUsuarioFilaPersistido,
  FilaPersistida,
} from './modelo-fila.js';

export const REPOSITORIO_FILAS = Symbol('REPOSITORIO_FILAS');

export interface RepositorioFilas {
  bloquearNome(nomeNormalizado: string, transacao: TransacaoPrisma): Promise<void>;
  bloquearFila(filaId: string, transacao: TransacaoPrisma): Promise<void>;
  bloquearVinculo(
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  criarFila(fila: FilaPersistida, transacao: TransacaoPrisma): Promise<boolean>;
  obterFila(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<FilaPersistida | undefined>;
  inativarFila(
    filaId: string,
    inativadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  usuarioEstaAtivo(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterAcesso(
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<AcessoUsuarioFilaPersistido | undefined>;
  listarUsuariosAfetadosFila(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly string[]>;
  concederAcesso(
    acesso: AcessoUsuarioFilaPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  revogarAcesso(
    filaId: string,
    usuarioId: string,
    revogadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
