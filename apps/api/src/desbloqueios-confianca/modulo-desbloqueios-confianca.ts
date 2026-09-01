import { Module } from '@nestjs/common';

import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_DESBLOQUEIOS_CONFIANCA } from './repositorio-desbloqueios-confianca.js';
import { RepositorioDesbloqueiosConfiancaPrisma } from './repositorio-desbloqueios-confianca-prisma.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from './servico-elegibilidade-desbloqueio-confianca.js';
import { ServicoExecucaoDesbloqueioConfianca } from './servico-execucao-desbloqueio-confianca.js';

@Module({
  exports: [
    ServicoElegibilidadeDesbloqueioConfianca,
    ServicoExecucaoDesbloqueioConfianca,
  ],
  imports: [
    ModuloAuditoria,
    ModuloAutorizacao,
    ModuloIdempotencia,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioDesbloqueiosConfiancaPrisma,
    ServicoElegibilidadeDesbloqueioConfianca,
    ServicoExecucaoDesbloqueioConfianca,
    {
      provide: REPOSITORIO_DESBLOQUEIOS_CONFIANCA,
      useExisting: RepositorioDesbloqueiosConfiancaPrisma,
    },
  ],
})
export class ModuloDesbloqueiosConfianca {}
