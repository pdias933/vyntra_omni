import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_RELEASES } from './repositorio-releases.js';
import { RepositorioReleasesPrisma } from './repositorio-releases-prisma.js';
import { ServicoReleases } from './servico-releases.js';

@Module({
  exports: [ServicoReleases],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioReleasesPrisma,
    ServicoReleases,
    {
      provide: REPOSITORIO_RELEASES,
      useExisting: RepositorioReleasesPrisma,
    },
  ],
})
export class ModuloPoliticaReleases {}
