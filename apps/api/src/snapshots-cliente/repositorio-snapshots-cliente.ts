import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { SnapshotClientePersistido } from './modelo-snapshot-cliente.js';

export const REPOSITORIO_SNAPSHOTS_CLIENTE = Symbol(
  'REPOSITORIO_SNAPSHOTS_CLIENTE',
);

export interface RepositorioSnapshotsCliente {
  bloquearVinculo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  vinculoEstaAtivo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;

  obterPorVinculo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<SnapshotClientePersistido | undefined>;

  criar(
    snapshot: SnapshotClientePersistido,
    transacao: TransacaoPrisma,
  ): Promise<void>;

  atualizar(
    snapshot: SnapshotClientePersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
