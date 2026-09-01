import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_DISPONIBILIDADE } from './repositorio-disponibilidade.js';
import { RepositorioDisponibilidadePrisma } from './repositorio-disponibilidade-prisma.js';
import { ServicoDisponibilidade } from './servico-disponibilidade.js';

@Module({
  exports: [ServicoDisponibilidade],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [RepositorioDisponibilidadePrisma, ServicoDisponibilidade, { provide: REPOSITORIO_DISPONIBILIDADE, useExisting: RepositorioDisponibilidadePrisma }],
})
export class ModuloDisponibilidade {}

