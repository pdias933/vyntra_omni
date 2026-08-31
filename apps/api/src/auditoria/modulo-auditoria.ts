import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_AUDITORIA } from './repositorio-auditoria.js';
import { RepositorioAuditoriaPrisma } from './repositorio-auditoria-prisma.js';
import { ServicoAuditoria } from './servico-auditoria.js';

@Module({
  exports: [ServicoAuditoria],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioAuditoriaPrisma,
    ServicoAuditoria,
    {
      provide: REPOSITORIO_AUDITORIA,
      useExisting: RepositorioAuditoriaPrisma,
    },
  ],
})
export class ModuloAuditoria {}
