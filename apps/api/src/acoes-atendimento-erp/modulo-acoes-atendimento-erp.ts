import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { PoliticaLinkTranscricaoPublica } from './politica-link-transcricao.js';
import { REPOSITORIO_ACOES_ATENDIMENTO_ERP } from './repositorio-acoes-atendimento-erp.js';
import { RepositorioAcoesAtendimentoErpPrisma } from './repositorio-acoes-atendimento-erp-prisma.js';
import { ServicoAcoesAtendimentoErp } from './servico-acoes-atendimento-erp.js';

@Module({
  exports: [PoliticaLinkTranscricaoPublica, ServicoAcoesAtendimentoErp],
  imports: [
    ModuloAuditoria,
    ModuloAutorizacao,
    ModuloEventos,
    ModuloIdempotencia,
    ModuloPersistencia,
  ],
  providers: [
    PoliticaLinkTranscricaoPublica,
    RepositorioAcoesAtendimentoErpPrisma,
    ServicoAcoesAtendimentoErp,
    {
      provide: REPOSITORIO_ACOES_ATENDIMENTO_ERP,
      useExisting: RepositorioAcoesAtendimentoErpPrisma,
    },
  ],
})
export class ModuloAcoesAtendimentoErp {}
