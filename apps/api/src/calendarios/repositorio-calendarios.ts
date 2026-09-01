import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  CalendarioComposto,
  OverrideCalendarioPersistido,
} from './modelo-calendario.js';

export const REPOSITORIO_CALENDARIOS = Symbol('REPOSITORIO_CALENDARIOS');

export interface RepositorioCalendarios {
  bloquear(calendarioId: string, transacao: TransacaoPrisma): Promise<void>;
  obter(
    calendarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<CalendarioComposto | undefined>;
  existeOverrideSobreposto(
    calendarioId: string,
    vigenteDe: Date,
    vigenteAte: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  criarOverride(
    override: OverrideCalendarioPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
