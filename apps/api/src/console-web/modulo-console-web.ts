import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorConsoleWeb } from './controlador-console-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';
import { ServicoTimelineWeb } from './servico-timeline-web.js';

@Module({
  controllers: [ControladorConsoleWeb],
  imports: [ModuloAutenticacao, ModuloAutorizacao, ModuloPersistencia],
  providers: [ServicoListaAtendimentosWeb, ServicoTimelineWeb],
})
export class ModuloConsoleWeb {}
