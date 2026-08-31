import { Module } from '@nestjs/common';

import { ControladorInformacoesApi } from './sistema/controlador-informacoes-api.js';
import { ControladorRotasDesconhecidas } from './sistema/controlador-rotas-desconhecidas.js';
import { ServicoInformacoesApi } from './sistema/servico-informacoes-api.js';

@Module({
  controllers: [ControladorInformacoesApi, ControladorRotasDesconhecidas],
  providers: [ServicoInformacoesApi],
})
export class ModuloAplicacao {}
