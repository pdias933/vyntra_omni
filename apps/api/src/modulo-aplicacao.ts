import { Module } from '@nestjs/common';

import { ModuloAdministracaoUsuarios } from './administracao-usuarios/modulo-administracao-usuarios.js';
import { ModuloAdministracaoOperacional } from './administracao-operacional/modulo-administracao-operacional.js';
import { ModuloAcoesAtendimentoErp } from './acoes-atendimento-erp/modulo-acoes-atendimento-erp.js';
import { ModuloAuditoria } from './auditoria/modulo-auditoria.js';
import { ModuloAtribuicoesAtendimento } from './atribuicoes-atendimento/modulo-atribuicoes-atendimento.js';
import { ModuloAutenticacao } from './autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from './autorizacao/modulo-autorizacao.js';
import { ModuloCalendarios } from './calendarios/modulo-calendarios.js';
import { ModuloContasWhatsApp } from './contas-whatsapp/modulo-contas-whatsapp.js';
import { ModuloContatos } from './contatos/modulo-contatos.js';
import { ModuloConsoleMobile } from './console-mobile/modulo-console-mobile.js';
import { ModuloConsoleWeb } from './console-web/modulo-console-web.js';
import { ModuloCopiasAtendimento } from './copias-atendimento/modulo-copias-atendimento.js';
import { ModuloContextosCliente } from './contextos-cliente/modulo-contextos-cliente.js';
import { ModuloConversas } from './conversas/modulo-conversas.js';
import { ModuloEventos } from './eventos/modulo-eventos.js';
import { ModuloConsultasErp } from './erp/modulo-consultas-erp.js';
import { ModuloExecucoesFluxo } from './execucoes-fluxo/modulo-execucoes-fluxo.js';
import { ModuloDisponibilidade } from './disponibilidade/modulo-disponibilidade.js';
import { ModuloDesbloqueiosConfianca } from './desbloqueios-confianca/modulo-desbloqueios-confianca.js';
import { ModuloFilas } from './filas/modulo-filas.js';
import { ModuloFluxos } from './fluxos/modulo-fluxos.js';
import { ModuloFormularios } from './formularios/modulo-formularios.js';
import { ModuloHistoricoAtribuicao } from './historico-atribuicao/modulo-historico-atribuicao.js';
import { ModuloIdempotencia } from './idempotencia/modulo-idempotencia.js';
import { ModuloJanelaCanal } from './janela-canal/modulo-janela-canal.js';
import { ModuloMensagens } from './mensagens/modulo-mensagens.js';
import { ModuloNotasInternas } from './notas-internas/modulo-notas-internas.js';
import { ModuloObservabilidade } from './observabilidade/modulo-observabilidade.js';
import { ModuloOrdensServico } from './ordens-servico/modulo-ordens-servico.js';
import { ModuloPersistencia } from './persistencia/modulo-persistencia.js';
import { ModuloProtocolosErp } from './protocolos-erp/modulo-protocolos-erp.js';
import { ControladorInformacoesApi } from './sistema/controlador-informacoes-api.js';
import { ControladorRotasDesconhecidas } from './sistema/controlador-rotas-desconhecidas.js';
import { ServicoInformacoesApi } from './sistema/servico-informacoes-api.js';
import { ControladorSaude } from './saude/controlador-saude.js';
import { ControladorSaudeAdministrativa } from './saude/controlador-saude-administrativa.js';
import { ServicoSaudeAdministrativa } from './saude/servico-saude-administrativa.js';
import { ServicoProntidao } from './saude/servico-prontidao.js';
import { ModuloReleases } from './releases/modulo-releases.js';
import { ModuloRelatoriosOperacionais } from './relatorios-operacionais/modulo-relatorios-operacionais.js';
import { ModuloSnapshotsCliente } from './snapshots-cliente/modulo-snapshots-cliente.js';
import { ModuloSla } from './sla/modulo-sla.js';
import { ModuloSincronizacao } from './sincronizacao/modulo-sincronizacao.js';

@Module({
  controllers: [
    ControladorInformacoesApi,
    ControladorSaude,
    ControladorSaudeAdministrativa,
    ControladorRotasDesconhecidas,
  ],
  imports: [
    ModuloAdministracaoOperacional,
    ModuloAdministracaoUsuarios,
    ModuloAcoesAtendimentoErp,
    ModuloAuditoria,
    ModuloAtribuicoesAtendimento,
    ModuloAutenticacao,
    ModuloAutorizacao,
    ModuloCalendarios,
    ModuloContasWhatsApp,
    ModuloContatos,
    ModuloConsoleMobile,
    ModuloConsoleWeb,
    ModuloCopiasAtendimento,
    ModuloContextosCliente,
    ModuloConversas,
    ModuloConsultasErp.registrar(),
    ModuloDesbloqueiosConfianca,
    ModuloEventos,
    ModuloExecucoesFluxo,
    ModuloDisponibilidade,
    ModuloFilas,
    ModuloFluxos,
    ModuloFormularios,
    ModuloHistoricoAtribuicao,
    ModuloIdempotencia,
    ModuloJanelaCanal,
    ModuloMensagens,
    ModuloNotasInternas,
    ModuloObservabilidade,
    ModuloOrdensServico,
    ModuloPersistencia,
    ModuloProtocolosErp,
    ModuloReleases,
    ModuloRelatoriosOperacionais,
    ModuloSnapshotsCliente,
    ModuloSincronizacao,
    ModuloSla,
  ],
  providers: [
    ServicoInformacoesApi,
    ServicoProntidao,
    ServicoSaudeAdministrativa,
  ],
})
export class ModuloAplicacao {}
