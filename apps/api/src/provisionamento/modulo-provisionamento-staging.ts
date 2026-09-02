import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ServicoProtecaoMfa } from '../autenticacao/servico-protecao-mfa.js';
import { ServicoSenha } from '../autenticacao/servico-senha.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ServicoProvisionamentoAdministradorStaging } from './servico-provisionamento-administrador-staging.js';

@Module({
  imports: [ModuloAuditoria, ModuloPersistencia],
  providers: [
    ServicoProtecaoMfa,
    ServicoProvisionamentoAdministradorStaging,
    ServicoSenha,
  ],
})
export class ModuloProvisionamentoStaging {}
