import { Module } from '@nestjs/common';

import { ModuloAuditoria } from './auditoria/modulo-auditoria.js';
import { ModuloAtribuicoesAtendimento } from './atribuicoes-atendimento/modulo-atribuicoes-atendimento.js';
import { ModuloAutenticacao } from './autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from './autorizacao/modulo-autorizacao.js';
import { ModuloCalendarios } from './calendarios/modulo-calendarios.js';
import { ModuloContasWhatsApp } from './contas-whatsapp/modulo-contas-whatsapp.js';
import { ModuloContatos } from './contatos/modulo-contatos.js';
import { ModuloContextosCliente } from './contextos-cliente/modulo-contextos-cliente.js';
import { ModuloConversas } from './conversas/modulo-conversas.js';
import { ModuloEventos } from './eventos/modulo-eventos.js';
import { ModuloDisponibilidade } from './disponibilidade/modulo-disponibilidade.js';
import { ModuloFilas } from './filas/modulo-filas.js';
import { ModuloHistoricoAtribuicao } from './historico-atribuicao/modulo-historico-atribuicao.js';
import { ModuloIdempotencia } from './idempotencia/modulo-idempotencia.js';
import { ModuloJanelaCanal } from './janela-canal/modulo-janela-canal.js';
import { ModuloPersistencia } from './persistencia/modulo-persistencia.js';
import { ModuloProtocolosErp } from './protocolos-erp/modulo-protocolos-erp.js';
import { ControladorInformacoesApi } from './sistema/controlador-informacoes-api.js';
import { ControladorRotasDesconhecidas } from './sistema/controlador-rotas-desconhecidas.js';
import { ServicoInformacoesApi } from './sistema/servico-informacoes-api.js';
import { ControladorSaude } from './saude/controlador-saude.js';
import { ServicoProntidao } from './saude/servico-prontidao.js';
import { ModuloReleases } from './releases/modulo-releases.js';
import { ModuloSnapshotsCliente } from './snapshots-cliente/modulo-snapshots-cliente.js';
import { ModuloSla } from './sla/modulo-sla.js';

@Module({
  controllers: [
    ControladorInformacoesApi,
    ControladorSaude,
    ControladorRotasDesconhecidas,
  ],
  imports: [
    ModuloAuditoria,
    ModuloAtribuicoesAtendimento,
    ModuloAutenticacao,
    ModuloAutorizacao,
    ModuloCalendarios,
    ModuloContasWhatsApp,
    ModuloContatos,
    ModuloContextosCliente,
    ModuloConversas,
    ModuloEventos,
    ModuloDisponibilidade,
    ModuloFilas,
    ModuloHistoricoAtribuicao,
    ModuloIdempotencia,
    ModuloJanelaCanal,
    ModuloPersistencia,
    ModuloProtocolosErp,
    ModuloReleases,
    ModuloSnapshotsCliente,
    ModuloSla,
  ],
  providers: [ServicoInformacoesApi, ServicoProntidao],
})
export class ModuloAplicacao {}
