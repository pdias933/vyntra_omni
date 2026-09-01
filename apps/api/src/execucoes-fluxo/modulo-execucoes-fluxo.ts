import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloFluxos } from '../fluxos/modulo-fluxos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_EXECUCOES_FLUXO } from './repositorio-execucoes-fluxo.js';
import { RepositorioExecucoesFluxoPrisma } from './repositorio-execucoes-fluxo-prisma.js';
import { ServicoExecucoesFluxo } from './servico-execucoes-fluxo.js';
import { ServicoRecuperacaoExecucoesFluxo } from './servico-recuperacao-execucoes-fluxo.js';

@Module({
  exports: [ServicoExecucoesFluxo, ServicoRecuperacaoExecucoesFluxo],
  imports: [ModuloAuditoria, ModuloFluxos, ModuloPersistencia],
  providers: [
    RepositorioExecucoesFluxoPrisma,
    ServicoExecucoesFluxo,
    ServicoRecuperacaoExecucoesFluxo,
    {
      provide: REPOSITORIO_EXECUCOES_FLUXO,
      useExisting: RepositorioExecucoesFluxoPrisma,
    },
  ],
})
export class ModuloExecucoesFluxo {}
