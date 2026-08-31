import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ControladorReleases } from './controlador-releases.js';
import { ModuloPoliticaReleases } from './modulo-politica-releases.js';

@Module({
  controllers: [ControladorReleases],
  imports: [ModuloAutenticacao, ModuloPoliticaReleases],
})
export class ModuloReleases {}
