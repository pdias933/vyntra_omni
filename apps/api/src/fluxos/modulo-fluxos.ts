import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_FLUXOS } from './repositorio-fluxos.js';
import { RepositorioFluxosPrisma } from './repositorio-fluxos-prisma.js';
import { ServicoCatalogoFluxos } from './servico-catalogo-fluxos.js';
import { ServicoPublicacaoFluxos } from './servico-publicacao-fluxos.js';

@Module({
  exports: [ServicoCatalogoFluxos, ServicoPublicacaoFluxos],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioFluxosPrisma,
    ServicoCatalogoFluxos,
    ServicoPublicacaoFluxos,
    { provide: REPOSITORIO_FLUXOS, useExisting: RepositorioFluxosPrisma },
  ],
})
export class ModuloFluxos {}
