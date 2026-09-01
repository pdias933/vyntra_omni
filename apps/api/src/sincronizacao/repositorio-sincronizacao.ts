import type {
  EventoVarridoSincronizacao,
  LimitesRetencaoEventos,
} from './modelo-sincronizacao.js';

export const REPOSITORIO_SINCRONIZACAO = Symbol('REPOSITORIO_SINCRONIZACAO');

export interface RepositorioSincronizacao {
  obterLimitesRetencao(corteRetencao: Date): Promise<LimitesRetencaoEventos>;
  listarEventos(
    usuarioId: string,
    apos: bigint,
    corteRetencao: Date,
    limite: number,
  ): Promise<readonly EventoVarridoSincronizacao[]>;
}
