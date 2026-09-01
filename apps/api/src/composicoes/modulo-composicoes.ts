import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_COMPOSICOES_SEGUNDA_VIA } from './repositorio-composicoes-segunda-via.js';
import { RepositorioComposicoesSegundaViaPrisma } from './repositorio-composicoes-segunda-via-prisma.js';

@Module({
  exports: [REPOSITORIO_COMPOSICOES_SEGUNDA_VIA],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioComposicoesSegundaViaPrisma,
    {
      provide: REPOSITORIO_COMPOSICOES_SEGUNDA_VIA,
      useExisting: RepositorioComposicoesSegundaViaPrisma,
    },
  ],
})
export class ModuloComposicoes {}
