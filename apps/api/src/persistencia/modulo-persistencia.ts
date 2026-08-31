import { Module } from '@nestjs/common';

import { ServicoPrisma } from './servico-prisma.js';

@Module({
  exports: [ServicoPrisma],
  providers: [ServicoPrisma],
})
export class ModuloPersistencia {}
