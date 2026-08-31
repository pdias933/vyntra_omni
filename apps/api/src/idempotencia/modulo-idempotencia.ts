import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ServicoIdempotencia } from './servico-idempotencia.js';

@Module({
  exports: [ServicoIdempotencia],
  imports: [ModuloPersistencia],
  providers: [ServicoIdempotencia],
})
export class ModuloIdempotencia {}
