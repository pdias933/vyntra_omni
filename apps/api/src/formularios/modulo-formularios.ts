import { Module } from '@nestjs/common';

import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_FORMULARIOS } from './repositorio-formularios.js';
import { RepositorioFormulariosPrisma } from './repositorio-formularios-prisma.js';
import { ServicoFormularios } from './servico-formularios.js';

@Module({
  exports: [ServicoFormularios],
  imports: [ModuloEventos, ModuloPersistencia],
  providers: [
    RepositorioFormulariosPrisma,
    ServicoFormularios,
    {
      provide: REPOSITORIO_FORMULARIOS,
      useExisting: RepositorioFormulariosPrisma,
    },
  ],
})
export class ModuloFormularios {}
