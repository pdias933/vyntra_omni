import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloHistoricoAtribuicao } from '../historico-atribuicao/modulo-historico-atribuicao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_ATRIBUICOES_ATENDIMENTO } from './repositorio-atribuicoes-atendimento.js';
import { RepositorioAtribuicoesAtendimentoPrisma } from './repositorio-atribuicoes-atendimento-prisma.js';
import { ServicoAtribuicoesAtendimento } from './servico-atribuicoes-atendimento.js';

@Module({
  exports: [ServicoAtribuicoesAtendimento],
  imports: [
    ModuloAuditoria,
    ModuloAutorizacao,
    ModuloEventos,
    ModuloHistoricoAtribuicao,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioAtribuicoesAtendimentoPrisma,
    ServicoAtribuicoesAtendimento,
    {
      provide: REPOSITORIO_ATRIBUICOES_ATENDIMENTO,
      useExisting: RepositorioAtribuicoesAtendimentoPrisma,
    },
  ],
})
export class ModuloAtribuicoesAtendimento {}
