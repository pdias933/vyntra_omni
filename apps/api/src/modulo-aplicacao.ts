import { Module } from '@nestjs/common';

import { ModuloAuditoria } from './auditoria/modulo-auditoria.js';
import { ModuloAutenticacao } from './autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from './autorizacao/modulo-autorizacao.js';
import { ModuloContasWhatsApp } from './contas-whatsapp/modulo-contas-whatsapp.js';
import { ModuloContatos } from './contatos/modulo-contatos.js';
import { ModuloContextosCliente } from './contextos-cliente/modulo-contextos-cliente.js';
import { ModuloConversas } from './conversas/modulo-conversas.js';
import { ModuloEventos } from './eventos/modulo-eventos.js';
import { ModuloIdempotencia } from './idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from './persistencia/modulo-persistencia.js';
import { ModuloProtocolosErp } from './protocolos-erp/modulo-protocolos-erp.js';
import { ControladorInformacoesApi } from './sistema/controlador-informacoes-api.js';
import { ControladorRotasDesconhecidas } from './sistema/controlador-rotas-desconhecidas.js';
import { ServicoInformacoesApi } from './sistema/servico-informacoes-api.js';
import { ControladorSaude } from './saude/controlador-saude.js';
import { ServicoProntidao } from './saude/servico-prontidao.js';
import { ModuloReleases } from './releases/modulo-releases.js';
import { ModuloSnapshotsCliente } from './snapshots-cliente/modulo-snapshots-cliente.js';

@Module({
  controllers: [
    ControladorInformacoesApi,
    ControladorSaude,
    ControladorRotasDesconhecidas,
  ],
  imports: [
    ModuloAuditoria,
    ModuloAutenticacao,
    ModuloAutorizacao,
    ModuloContasWhatsApp,
    ModuloContatos,
    ModuloContextosCliente,
    ModuloConversas,
    ModuloEventos,
    ModuloIdempotencia,
    ModuloPersistencia,
    ModuloProtocolosErp,
    ModuloReleases,
    ModuloSnapshotsCliente,
  ],
  providers: [ServicoInformacoesApi, ServicoProntidao],
})
export class ModuloAplicacao {}
