import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloCalendarios } from '../calendarios/modulo-calendarios.js';
import { ModuloFilas } from '../filas/modulo-filas.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorAdministracaoOperacional } from './controlador-administracao-operacional.js';
import { ServicoAdministracaoOperacional } from './servico-administracao-operacional.js';

@Module({ controllers: [ControladorAdministracaoOperacional], imports: [ModuloAutenticacao, ModuloAutorizacao, ModuloCalendarios, ModuloFilas, ModuloPersistencia], providers: [ServicoAdministracaoOperacional] })
export class ModuloAdministracaoOperacional {}
