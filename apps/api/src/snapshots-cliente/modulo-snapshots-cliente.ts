import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_SNAPSHOTS_CLIENTE } from './repositorio-snapshots-cliente.js';
import { RepositorioSnapshotsClientePrisma } from './repositorio-snapshots-cliente-prisma.js';
import { ServicoSnapshotsCliente } from './servico-snapshots-cliente.js';

@Module({
  exports: [REPOSITORIO_SNAPSHOTS_CLIENTE, ServicoSnapshotsCliente],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioSnapshotsClientePrisma,
    ServicoSnapshotsCliente,
    {
      provide: REPOSITORIO_SNAPSHOTS_CLIENTE,
      useExisting: RepositorioSnapshotsClientePrisma,
    },
  ],
})
export class ModuloSnapshotsCliente {}
