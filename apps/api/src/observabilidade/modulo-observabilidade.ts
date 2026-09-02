import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ServicoProntidao } from '../saude/servico-prontidao.js';
import { ControladorObservabilidade } from './controlador-observabilidade.js';
import { MonitorAlertasOperacionais } from './monitor-alertas-operacionais.js';
import { ServicoObservabilidade } from './servico-observabilidade.js';

@Module({
  controllers: [ControladorObservabilidade],
  imports: [ModuloAutenticacao, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    MonitorAlertasOperacionais,
    ServicoObservabilidade,
    ServicoProntidao,
  ],
})
export class ModuloObservabilidade {}
