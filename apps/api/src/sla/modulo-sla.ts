import { Module } from '@nestjs/common';

import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_SLA } from './repositorio-sla.js';
import { RepositorioSlaPrisma } from './repositorio-sla-prisma.js';
import { ServicoSla } from './servico-sla.js';

@Module({
  exports: [ServicoSla],
  imports: [ModuloEventos, ModuloPersistencia],
  providers: [
    RepositorioSlaPrisma,
    ServicoSla,
    { provide: REPOSITORIO_SLA, useExisting: RepositorioSlaPrisma },
  ],
})
export class ModuloSla {}
