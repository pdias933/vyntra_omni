import { Module } from '@nestjs/common';

import { ModuloAtribuicoesAtendimento } from '../atribuicoes-atendimento/modulo-atribuicoes-atendimento.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ServicoOperacaoAtendimentos } from './servico-operacao-atendimentos.js';

@Module({
  imports: [ModuloAtribuicoesAtendimento, ModuloAutorizacao, ModuloIdempotencia, ModuloPersistencia],
  providers: [ServicoOperacaoAtendimentos],
  exports: [ServicoOperacaoAtendimentos],
})
export class ModuloOperacaoAtendimentos {}
