import { Module } from '@nestjs/common';

import { ModuloExecucoesFluxo } from './modulo-execucoes-fluxo.js';
import { ProcessoRecuperacaoExecucoesFluxo } from './processo-recuperacao-execucoes-fluxo.js';

@Module({
  imports: [ModuloExecucoesFluxo],
  providers: [ProcessoRecuperacaoExecucoesFluxo],
})
export class ModuloWorkerFluxos {}
