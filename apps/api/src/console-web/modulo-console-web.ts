import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorConsoleWeb } from './controlador-console-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';
import { ServicoTimelineWeb } from './servico-timeline-web.js';
import { ModuloMensagens } from '../mensagens/modulo-mensagens.js';
import { ModuloMidias } from '../midias/modulo-midias.js';
import { ServicoComposerWeb } from './servico-composer-web.js';
import { ServicoBuscaGaleriaWeb } from './servico-busca-galeria-web.js';

@Module({
  controllers: [ControladorConsoleWeb],
  imports: [ModuloAutenticacao, ModuloAutorizacao, ModuloMensagens, ModuloMidias, ModuloPersistencia],
  providers: [ServicoBuscaGaleriaWeb, ServicoComposerWeb, ServicoListaAtendimentosWeb, ServicoTimelineWeb],
})
export class ModuloConsoleWeb {}
