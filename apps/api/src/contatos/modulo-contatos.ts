import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloContasWhatsApp } from '../contas-whatsapp/modulo-contas-whatsapp.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CONTATOS } from './repositorio-contatos.js';
import { RepositorioContatosPrisma } from './repositorio-contatos-prisma.js';
import { ServicoIdentidadeWhatsApp } from './servico-identidade-whatsapp.js';

@Module({
  exports: [REPOSITORIO_CONTATOS, ServicoIdentidadeWhatsApp],
  imports: [ModuloAuditoria, ModuloContasWhatsApp, ModuloPersistencia],
  providers: [
    RepositorioContatosPrisma,
    ServicoIdentidadeWhatsApp,
    {
      provide: REPOSITORIO_CONTATOS,
      useExisting: RepositorioContatosPrisma,
    },
  ],
})
export class ModuloContatos {}
