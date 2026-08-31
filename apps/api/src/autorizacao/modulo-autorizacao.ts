import { Module } from '@nestjs/common';

import { REPOSITORIO_AUTORIZACAO } from './repositorio-autorizacao.js';
import { RepositorioAutorizacaoPrisma } from './repositorio-autorizacao-prisma.js';
import { ServicoAutorizacao } from './servico-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';

@Module({
  exports: [ServicoAutorizacao],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioAutorizacaoPrisma,
    ServicoAutorizacao,
    {
      provide: REPOSITORIO_AUTORIZACAO,
      useExisting: RepositorioAutorizacaoPrisma,
    },
  ],
})
export class ModuloAutorizacao {}
