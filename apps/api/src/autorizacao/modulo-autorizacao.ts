import { Module } from '@nestjs/common';

import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_AUTORIZACAO } from './repositorio-autorizacao.js';
import { RepositorioAutorizacaoPrisma } from './repositorio-autorizacao-prisma.js';
import { REPOSITORIO_INVALIDACAO_PERMISSOES } from './repositorio-invalidacao-permissoes.js';
import { RepositorioInvalidacaoPermissoesPrisma } from './repositorio-invalidacao-permissoes-prisma.js';
import { ServicoAutorizacao } from './servico-autorizacao.js';
import { ServicoInvalidacaoPermissoes } from './servico-invalidacao-permissoes.js';

@Module({
  exports: [ServicoAutorizacao, ServicoInvalidacaoPermissoes],
  imports: [ModuloEventos, ModuloPersistencia],
  providers: [
    RepositorioAutorizacaoPrisma,
    RepositorioInvalidacaoPermissoesPrisma,
    ServicoAutorizacao,
    ServicoInvalidacaoPermissoes,
    {
      provide: REPOSITORIO_AUTORIZACAO,
      useExisting: RepositorioAutorizacaoPrisma,
    },
    {
      provide: REPOSITORIO_INVALIDACAO_PERMISSOES,
      useExisting: RepositorioInvalidacaoPermissoesPrisma,
    },
  ],
})
export class ModuloAutorizacao {}
