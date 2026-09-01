import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { DisponibilidadeUsuarioPersistida } from './modelo-disponibilidade.js';

export const REPOSITORIO_DISPONIBILIDADE = Symbol('REPOSITORIO_DISPONIBILIDADE');

export interface RepositorioDisponibilidade {
  bloquearUsuario(usuarioId: string, transacao: TransacaoPrisma): Promise<void>;
  usuarioEstaAtivo(usuarioId: string, transacao: TransacaoPrisma): Promise<boolean>;
  obter(usuarioId: string, transacao: TransacaoPrisma): Promise<DisponibilidadeUsuarioPersistida | undefined>;
  criar(disponibilidade: DisponibilidadeUsuarioPersistida, transacao: TransacaoPrisma): Promise<boolean>;
  alterar(disponibilidade: DisponibilidadeUsuarioPersistida, versaoEsperada: number, transacao: TransacaoPrisma): Promise<boolean>;
}

