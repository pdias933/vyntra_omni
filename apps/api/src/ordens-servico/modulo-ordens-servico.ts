import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_ORDENS_SERVICO } from './repositorio-ordens-servico.js';
import { RepositorioOrdensServicoPrisma } from './repositorio-ordens-servico-prisma.js';
import { ServicoOrdensServicoErp } from './servico-ordens-servico.js';

@Module({
  exports: [ServicoOrdensServicoErp],
  imports: [
    ModuloAuditoria,
    ModuloAutorizacao,
    ModuloIdempotencia,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioOrdensServicoPrisma,
    ServicoOrdensServicoErp,
    {
      provide: REPOSITORIO_ORDENS_SERVICO,
      useExisting: RepositorioOrdensServicoPrisma,
    },
  ],
})
export class ModuloOrdensServico {}
