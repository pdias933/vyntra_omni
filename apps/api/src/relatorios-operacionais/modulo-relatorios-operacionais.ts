import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorRelatoriosOperacionais } from './controlador-relatorios-operacionais.js';
import { ServicoRelatoriosOperacionais } from './servico-relatorios-operacionais.js';

@Module({ controllers: [ControladorRelatoriosOperacionais], imports: [ModuloAutenticacao, ModuloAutorizacao, ModuloPersistencia], providers: [ServicoRelatoriosOperacionais] })
export class ModuloRelatoriosOperacionais {}
