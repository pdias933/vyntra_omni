import { Module } from '@nestjs/common';
import { ModuloOperacaoAtendimentos } from '../operacao-atendimentos/modulo-operacao-atendimentos.js';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloConsoleWeb } from '../console-web/modulo-console-web.js';
import { ControladorConsoleMobile } from './controlador-console-mobile.js';

@Module({
  controllers: [ControladorConsoleMobile],
  imports: [ModuloAutenticacao, ModuloConsoleWeb, ModuloOperacaoAtendimentos],
})
export class ModuloConsoleMobile {}
