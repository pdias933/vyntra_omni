import { Module } from '@nestjs/common';

import { ControladorInformacoesApi } from './sistema/controlador-informacoes-api.js';
import { ControladorRotasDesconhecidas } from './sistema/controlador-rotas-desconhecidas.js';
import { ServicoInformacoesApi } from './sistema/servico-informacoes-api.js';
import { ControladorSaude } from './saude/controlador-saude.js';
import { ServicoProntidao } from './saude/servico-prontidao.js';

@Module({
  controllers: [
    ControladorInformacoesApi,
    ControladorSaude,
    ControladorRotasDesconhecidas,
  ],
  providers: [ServicoInformacoesApi, ServicoProntidao],
})
export class ModuloAplicacao {}
