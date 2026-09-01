import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_FILAS } from './repositorio-filas.js';
import { RepositorioFilasPrisma } from './repositorio-filas-prisma.js';
import { ServicoFilas } from './servico-filas.js';

@Module({
  exports: [ServicoFilas],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioFilasPrisma,
    ServicoFilas,
    { provide: REPOSITORIO_FILAS, useExisting: RepositorioFilasPrisma },
  ],
})
export class ModuloFilas {}

