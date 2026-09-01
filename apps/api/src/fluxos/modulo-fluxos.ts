import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ModuloAutenticacao } from '../autenticacao/modulo-autenticacao.js';
import { ControladorEditorFluxos } from './controlador-editor-fluxos.js';
import { REPOSITORIO_FLUXOS } from './repositorio-fluxos.js';
import { RepositorioFluxosPrisma } from './repositorio-fluxos-prisma.js';
import { ProvedorContextoValidacaoFluxoConservador } from './provedor-contexto-validacao-fluxo-conservador.js';
import { PROVEDOR_CONTEXTO_VALIDACAO_FLUXO } from './provedor-contexto-validacao-fluxo.js';
import { ServicoCatalogoFluxos } from './servico-catalogo-fluxos.js';
import { ServicoEditorFluxos } from './servico-editor-fluxos.js';
import { ServicoPublicacaoFluxos } from './servico-publicacao-fluxos.js';
import { ServicoValidacaoPublicacaoFluxos } from './servico-validacao-publicacao-fluxos.js';
import { SimuladorFluxos } from './simulador-fluxos.js';
import { ValidadorPublicacaoFluxo } from './validador-publicacao-fluxo.js';

@Module({
  controllers: [ControladorEditorFluxos],
  exports: [
    ServicoCatalogoFluxos,
    ServicoPublicacaoFluxos,
    ServicoValidacaoPublicacaoFluxos,
  ],
  imports: [
    ModuloAuditoria,
    ModuloAutenticacao,
    ModuloAutorizacao,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioFluxosPrisma,
    ProvedorContextoValidacaoFluxoConservador,
    ServicoCatalogoFluxos,
    ServicoEditorFluxos,
    ServicoPublicacaoFluxos,
    ServicoValidacaoPublicacaoFluxos,
    SimuladorFluxos,
    ValidadorPublicacaoFluxo,
    { provide: REPOSITORIO_FLUXOS, useExisting: RepositorioFluxosPrisma },
    {
      provide: PROVEDOR_CONTEXTO_VALIDACAO_FLUXO,
      useExisting: ProvedorContextoValidacaoFluxoConservador,
    },
  ],
})
export class ModuloFluxos {}
