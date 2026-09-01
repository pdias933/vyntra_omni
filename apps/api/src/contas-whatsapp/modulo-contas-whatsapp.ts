import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CONTA_WHATSAPP } from './repositorio-conta-whatsapp.js';
import { RepositorioContaWhatsAppPrisma } from './repositorio-conta-whatsapp-prisma.js';
import { ServicoContasWhatsApp } from './servico-contas-whatsapp.js';

@Module({
  exports: [REPOSITORIO_CONTA_WHATSAPP, ServicoContasWhatsApp],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioContaWhatsAppPrisma,
    ServicoContasWhatsApp,
    {
      provide: REPOSITORIO_CONTA_WHATSAPP,
      useExisting: RepositorioContaWhatsAppPrisma,
    },
  ],
})
export class ModuloContasWhatsApp {}
