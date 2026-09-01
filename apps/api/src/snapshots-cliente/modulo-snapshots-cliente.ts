import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_SNAPSHOTS_CLIENTE } from './repositorio-snapshots-cliente.js';
import { RepositorioSnapshotsClientePrisma } from './repositorio-snapshots-cliente-prisma.js';
import { ServicoSnapshotsCliente } from './servico-snapshots-cliente.js';
import { ServicoSincronizacaoSnapshotsCliente } from './servico-sincronizacao-snapshots-cliente.js';

@Module({
  exports: [
    REPOSITORIO_SNAPSHOTS_CLIENTE,
    ServicoSincronizacaoSnapshotsCliente,
    ServicoSnapshotsCliente,
  ],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioSnapshotsClientePrisma,
    ServicoSincronizacaoSnapshotsCliente,
    ServicoSnapshotsCliente,
    {
      provide: REPOSITORIO_SNAPSHOTS_CLIENTE,
      useExisting: RepositorioSnapshotsClientePrisma,
    },
  ],
})
export class ModuloSnapshotsCliente {}
