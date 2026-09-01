import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloCalendarios } from '../calendarios/modulo-calendarios.js';
import { ModuloContextosCliente } from '../contextos-cliente/modulo-contextos-cliente.js';
import { ModuloComposicoes } from '../composicoes/modulo-composicoes.js';
import { ModuloFluxos } from '../fluxos/modulo-fluxos.js';
import { ModuloFormularios } from '../formularios/modulo-formularios.js';
import { ModuloMensagens } from '../mensagens/modulo-mensagens.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_EXECUCOES_FLUXO } from './repositorio-execucoes-fluxo.js';
import { RepositorioExecucoesFluxoPrisma } from './repositorio-execucoes-fluxo-prisma.js';
import { REPOSITORIO_PASSOS_EXECUCAO_FLUXO } from './repositorio-passos-execucao-fluxo.js';
import { RepositorioPassosExecucaoFluxoPrisma } from './repositorio-passos-execucao-fluxo-prisma.js';
import { ServicoExecutorNosFluxo } from './servico-executor-nos-fluxo.js';
import { ServicoExecucoesFluxo } from './servico-execucoes-fluxo.js';
import { ServicoFaturasFluxo } from './servico-faturas-fluxo.js';
import { ServicoRecuperacaoExecucoesFluxo } from './servico-recuperacao-execucoes-fluxo.js';

@Module({
  exports: [
    ServicoExecucoesFluxo,
    ServicoExecutorNosFluxo,
    ServicoRecuperacaoExecucoesFluxo,
  ],
  imports: [
    ModuloAuditoria,
    ModuloCalendarios,
    ModuloComposicoes,
    ModuloContextosCliente,
    ModuloFluxos,
    ModuloFormularios,
    ModuloMensagens,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioExecucoesFluxoPrisma,
    RepositorioPassosExecucaoFluxoPrisma,
    ServicoExecucoesFluxo,
    ServicoExecutorNosFluxo,
    ServicoFaturasFluxo,
    ServicoRecuperacaoExecucoesFluxo,
    {
      provide: REPOSITORIO_EXECUCOES_FLUXO,
      useExisting: RepositorioExecucoesFluxoPrisma,
    },
    {
      provide: REPOSITORIO_PASSOS_EXECUCAO_FLUXO,
      useExisting: RepositorioPassosExecucaoFluxoPrisma,
    },
  ],
})
export class ModuloExecucoesFluxo {}
