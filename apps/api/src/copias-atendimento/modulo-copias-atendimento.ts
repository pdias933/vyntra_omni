import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorCopiasAtendimentoWeb } from './controlador-copias-atendimento-web.js';
import { ServicoCopiasAtendimento } from './servico-copias-atendimento.js';

@Module({
  controllers: [ControladorCopiasAtendimentoWeb],
  exports: [ServicoCopiasAtendimento],
  imports: [ModuloAuditoria, ModuloAutenticacao, ModuloAutorizacao, ModuloPersistencia],
  providers: [ServicoCopiasAtendimento],
})
export class ModuloCopiasAtendimento {}
