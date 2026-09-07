import { Module } from '@nestjs/common';
import { ModuloDisponibilidade } from '../disponibilidade/modulo-disponibilidade.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloNotasInternas } from '../notas-internas/modulo-notas-internas.js';

import { ModuloAtribuicoesAtendimento } from '../atribuicoes-atendimento/modulo-atribuicoes-atendimento.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ServicoOperacaoAtendimentos } from './servico-operacao-atendimentos.js';

@Module({
  imports: [ModuloAtribuicoesAtendimento, ModuloAutorizacao, ModuloIdempotencia, ModuloPersistencia, ModuloDisponibilidade, ModuloEventos, ModuloNotasInternas],
  providers: [ServicoOperacaoAtendimentos],
  exports: [ServicoOperacaoAtendimentos],
})
export class ModuloOperacaoAtendimentos {}
