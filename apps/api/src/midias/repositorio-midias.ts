import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { CategoriaMidia, MidiaMensagemPersistida } from './modelo-midia.js';

export const REPOSITORIO_MIDIAS = Symbol('REPOSITORIO_MIDIAS');

export interface RepositorioMidias {
  mensagemAceitaMidia(
    mensagemId: string,
    categoria: CategoriaMidia,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  acrescentar(midia: MidiaMensagemPersistida, transacao: TransacaoPrisma): Promise<void>;
}
