import { Module } from '@nestjs/common';

import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { CoordenadorSseSemLacuna } from './coordenador-sse-sem-lacuna.js';
import { RegistroConexoesSse } from './registro-conexoes-sse.js';
import { CoordenadorWebSocketMobileSemLacuna } from './coordenador-websocket-mobile-sem-lacuna.js';
import { ControladorSincronizacao } from './controlador-sincronizacao.js';
import { GatewayEventosMobile } from './gateway-eventos-mobile.js';
import { REPOSITORIO_SINCRONIZACAO } from './repositorio-sincronizacao.js';
import { RepositorioSincronizacaoPrisma } from './repositorio-sincronizacao-prisma.js';
import { REPOSITORIO_RESSINCRONIZACAO } from './repositorio-ressincronizacao.js';
import { RepositorioRessincronizacaoPrisma } from './repositorio-ressincronizacao-prisma.js';
import { ServicoRessincronizacaoCompleta } from './servico-ressincronizacao-completa.js';
import { ServicoAutorizacaoOffline } from './servico-autorizacao-offline.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';

@Module({
  controllers: [ControladorSincronizacao],
  exports: [ServicoRessincronizacaoCompleta, ServicoSincronizacaoIncremental],
  imports: [ModuloAutenticacao, ModuloPersistencia],
  providers: [
    CoordenadorSseSemLacuna,
    RegistroConexoesSse,
    CoordenadorWebSocketMobileSemLacuna,
    GatewayEventosMobile,
    RepositorioSincronizacaoPrisma,
    RepositorioRessincronizacaoPrisma,
    ServicoAutorizacaoOffline,
    ServicoRessincronizacaoCompleta,
    ServicoSincronizacaoIncremental,
    {
      provide: REPOSITORIO_SINCRONIZACAO,
      useExisting: RepositorioSincronizacaoPrisma,
    },
    {
      provide: REPOSITORIO_RESSINCRONIZACAO,
      useExisting: RepositorioRessincronizacaoPrisma,
    },
  ],
})
export class ModuloSincronizacao {}
