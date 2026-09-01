import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_HISTORICO_ATRIBUICAO } from './repositorio-historico-atribuicao.js';
import { RepositorioHistoricoAtribuicaoPrisma } from './repositorio-historico-atribuicao-prisma.js';
import { ServicoHistoricoAtribuicao } from './servico-historico-atribuicao.js';

@Module({
  exports: [ServicoHistoricoAtribuicao],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioHistoricoAtribuicaoPrisma,
    ServicoHistoricoAtribuicao,
    {
      provide: REPOSITORIO_HISTORICO_ATRIBUICAO,
      useExisting: RepositorioHistoricoAtribuicaoPrisma,
    },
  ],
})
export class ModuloHistoricoAtribuicao {}
