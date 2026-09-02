import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloConsoleWeb } from '../console-web/modulo-console-web.js';
import { ControladorConsoleMobile } from './controlador-console-mobile.js';

@Module({
  controllers: [ControladorConsoleMobile],
  imports: [ModuloAutenticacao, ModuloConsoleWeb],
})
export class ModuloConsoleMobile {}
