import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CONVERSAS } from './repositorio-conversas.js';
import { RepositorioConversasPrisma } from './repositorio-conversas-prisma.js';
import { ServicoConversas } from './servico-conversas.js';

@Module({
  exports: [REPOSITORIO_CONVERSAS, ServicoConversas],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioConversasPrisma,
    ServicoConversas,
    {
      provide: REPOSITORIO_CONVERSAS,
      useExisting: RepositorioConversasPrisma,
    },
  ],
})
export class ModuloConversas {}
