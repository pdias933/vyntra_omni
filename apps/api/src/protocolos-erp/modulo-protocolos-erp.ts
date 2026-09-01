import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_PROTOCOLOS_ERP } from './repositorio-protocolos-erp.js';
import { RepositorioProtocolosErpPrisma } from './repositorio-protocolos-erp-prisma.js';
import { ServicoProtocolosErp } from './servico-protocolos-erp.js';

@Module({
  exports: [ServicoProtocolosErp],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioProtocolosErpPrisma,
    ServicoProtocolosErp,
    {
      provide: REPOSITORIO_PROTOCOLOS_ERP,
      useExisting: RepositorioProtocolosErpPrisma,
    },
  ],
})
export class ModuloProtocolosErp {}

