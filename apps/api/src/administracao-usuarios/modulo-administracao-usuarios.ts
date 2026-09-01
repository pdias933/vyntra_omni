import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorAdministracaoUsuarios } from './controlador-administracao-usuarios.js';
import { ServicoAdministracaoUsuarios } from './servico-administracao-usuarios.js';

@Module({ controllers: [ControladorAdministracaoUsuarios], imports: [ModuloAuditoria, ModuloAutenticacao, ModuloAutorizacao, ModuloPersistencia], providers: [ServicoAdministracaoUsuarios] })
export class ModuloAdministracaoUsuarios {}
