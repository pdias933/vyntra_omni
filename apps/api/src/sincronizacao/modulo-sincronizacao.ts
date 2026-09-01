import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorSincronizacao } from './controlador-sincronizacao.js';
import { REPOSITORIO_SINCRONIZACAO } from './repositorio-sincronizacao.js';
import { RepositorioSincronizacaoPrisma } from './repositorio-sincronizacao-prisma.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';

@Module({
  controllers: [ControladorSincronizacao],
  exports: [ServicoSincronizacaoIncremental],
  imports: [ModuloAutenticacao, ModuloPersistencia],
  providers: [
    RepositorioSincronizacaoPrisma,
    ServicoSincronizacaoIncremental,
    {
      provide: REPOSITORIO_SINCRONIZACAO,
      useExisting: RepositorioSincronizacaoPrisma,
    },
  ],
})
export class ModuloSincronizacao {}
