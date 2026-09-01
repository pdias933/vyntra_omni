import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CALENDARIOS } from './repositorio-calendarios.js';
import { RepositorioCalendariosPrisma } from './repositorio-calendarios-prisma.js';
import { ServicoCalendarios } from './servico-calendarios.js';

@Module({
  exports: [ServicoCalendarios],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioCalendariosPrisma,
    ServicoCalendarios,
    {
      provide: REPOSITORIO_CALENDARIOS,
      useExisting: RepositorioCalendariosPrisma,
    },
  ],
})
export class ModuloCalendarios {}
