import { Module } from '@nestjs/common';

import { ModuloIdempotencia } from '../idempotencia/modulo-idempotencia.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_PROTOCOLOS_ERP } from './repositorio-protocolos-erp.js';
import { RepositorioProtocolosErpPrisma } from './repositorio-protocolos-erp-prisma.js';
import { ServicoCriacaoProtocoloErp } from './servico-criacao-protocolo-erp.js';
import { ServicoProtocolosErp } from './servico-protocolos-erp.js';

@Module({
  exports: [ServicoCriacaoProtocoloErp, ServicoProtocolosErp],
  imports: [ModuloIdempotencia, ModuloPersistencia],
  providers: [
    RepositorioProtocolosErpPrisma,
    ServicoCriacaoProtocoloErp,
    ServicoProtocolosErp,
    {
      provide: REPOSITORIO_PROTOCOLOS_ERP,
      useExisting: RepositorioProtocolosErpPrisma,
    },
  ],
})
export class ModuloProtocolosErp {}
