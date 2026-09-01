import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_NOTAS_INTERNAS } from './repositorio-notas-internas.js';
import { RepositorioNotasInternasPrisma } from './repositorio-notas-internas-prisma.js';
import { ServicoNotasInternas } from './servico-notas-internas.js';

@Module({
  exports: [ServicoNotasInternas],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloEventos, ModuloPersistencia],
  providers: [
    RepositorioNotasInternasPrisma,
    ServicoNotasInternas,
    {
      provide: REPOSITORIO_NOTAS_INTERNAS,
      useExisting: RepositorioNotasInternasPrisma,
    },
  ],
})
export class ModuloNotasInternas {}
