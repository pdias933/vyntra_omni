import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CONTEXTOS_CLIENTE } from './repositorio-contextos-cliente.js';
import { RepositorioContextosClientePrisma } from './repositorio-contextos-cliente-prisma.js';
import { ServicoContextosCliente } from './servico-contextos-cliente.js';

@Module({
  exports: [REPOSITORIO_CONTEXTOS_CLIENTE, ServicoContextosCliente],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioContextosClientePrisma,
    ServicoContextosCliente,
    {
      provide: REPOSITORIO_CONTEXTOS_CLIENTE,
      useExisting: RepositorioContextosClientePrisma,
    },
  ],
})
export class ModuloContextosCliente {}
