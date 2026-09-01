import type { SnapshotSincronizacaoCompleta } from './modelo-sincronizacao.js';

export const REPOSITORIO_RESSINCRONIZACAO = Symbol(
  'REPOSITORIO_RESSINCRONIZACAO',
);

export interface RepositorioRessincronizacao {
  criarSnapshotAutorizado(
    usuarioId: string,
    geradoEm: Date,
  ): Promise<SnapshotSincronizacaoCompleta | undefined>;
}
