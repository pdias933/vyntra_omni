import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloContextosCliente } from '../contextos-cliente/modulo-contextos-cliente.js';
import { ModuloDesbloqueiosConfianca } from '../desbloqueios-confianca/modulo-desbloqueios-confianca.js';
import { ModuloMensagens } from '../mensagens/modulo-mensagens.js';
import { ModuloMidias } from '../midias/modulo-midias.js';
import { ModuloOrdensServico } from '../ordens-servico/modulo-ordens-servico.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ModuloSnapshotsCliente } from '../snapshots-cliente/modulo-snapshots-cliente.js';
import { ControladorConsoleWeb } from './controlador-console-web.js';
import { ServicoBuscaGaleriaWeb } from './servico-busca-galeria-web.js';
import { ServicoComposerWeb } from './servico-composer-web.js';
import { ServicoContatoAcoesWeb } from './servico-contato-acoes-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';
import { ServicoTimelineWeb } from './servico-timeline-web.js';

@Module({
  controllers: [ControladorConsoleWeb],
  exports: [ServicoContatoAcoesWeb, ServicoTimelineWeb],
  imports: [
    ModuloAutenticacao,
    ModuloAutorizacao,
    ModuloContextosCliente,
    ModuloDesbloqueiosConfianca,
    ModuloMensagens,
    ModuloMidias,
    ModuloOrdensServico,
    ModuloPersistencia,
    ModuloSnapshotsCliente,
  ],
  providers: [ServicoBuscaGaleriaWeb, ServicoComposerWeb, ServicoContatoAcoesWeb, ServicoListaAtendimentosWeb, ServicoTimelineWeb],
})
export class ModuloConsoleWeb {}
