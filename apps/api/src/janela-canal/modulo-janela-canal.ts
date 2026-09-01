import { Module } from '@nestjs/common';

import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_JANELA_CANAL } from './repositorio-janela-canal.js';
import { RepositorioJanelaCanalPrisma } from './repositorio-janela-canal-prisma.js';
import { ServicoJanelaCanal } from './servico-janela-canal.js';

@Module({
  exports: [ServicoJanelaCanal],
  imports: [ModuloEventos, ModuloPersistencia],
  providers: [
    RepositorioJanelaCanalPrisma,
    ServicoJanelaCanal,
    {
      provide: REPOSITORIO_JANELA_CANAL,
      useExisting: RepositorioJanelaCanalPrisma,
    },
  ],
})
export class ModuloJanelaCanal {}
