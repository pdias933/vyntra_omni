import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPoliticaReleases } from '../releases/modulo-politica-releases.js';
import { ControladorAutenticacaoWeb } from './controlador-autenticacao-web.js';
import { ControladorAutenticacaoMobile } from './controlador-autenticacao-mobile.js';
import { REPOSITORIO_AUTENTICACAO_MOBILE } from './repositorio-autenticacao-mobile.js';
import { RepositorioAutenticacaoMobilePrisma } from './repositorio-autenticacao-mobile-prisma.js';
import { ServicoAutenticacaoMobile } from './servico-autenticacao-mobile.js';
import { REPOSITORIO_AUTENTICACAO } from './repositorio-autenticacao.js';
import { RepositorioAutenticacaoPrisma } from './repositorio-autenticacao-prisma.js';
import { ServicoAutenticacaoWeb } from './servico-autenticacao-web.js';
import { ServicoOrigemWeb } from './servico-origem-web.js';
import { ServicoSenha } from './servico-senha.js';
import { REPOSITORIO_MFA } from './repositorio-mfa.js';
import { RepositorioMfaPrisma } from './repositorio-mfa-prisma.js';
import { ServicoMfa } from './servico-mfa.js';
import { ServicoProtecaoMfa } from './servico-protecao-mfa.js';
import { REPOSITORIO_PAREAMENTO_QR } from './repositorio-pareamento-qr.js';
import { RepositorioPareamentoQrPrisma } from './repositorio-pareamento-qr-prisma.js';
import { ServicoPareamentoQr } from './servico-pareamento-qr.js';

@Module({
  controllers: [ControladorAutenticacaoMobile, ControladorAutenticacaoWeb],
  exports: [
    ServicoAutenticacaoMobile,
    ServicoAutenticacaoWeb,
    ServicoMfa,
    ServicoOrigemWeb,
    ServicoProtecaoMfa,
    ServicoSenha,
  ],
  imports: [
    ModuloAuditoria,
    ModuloAutorizacao,
    ModuloPersistencia,
    ModuloPoliticaReleases,
  ],
  providers: [
    RepositorioAutenticacaoPrisma,
    RepositorioAutenticacaoMobilePrisma,
    RepositorioMfaPrisma,
    RepositorioPareamentoQrPrisma,
    ServicoAutenticacaoMobile,
    ServicoAutenticacaoWeb,
    ServicoPareamentoQr,
    ServicoMfa,
    ServicoOrigemWeb,
    ServicoProtecaoMfa,
    ServicoSenha,
    {
      provide: REPOSITORIO_AUTENTICACAO_MOBILE,
      useExisting: RepositorioAutenticacaoMobilePrisma,
    },
    {
      provide: REPOSITORIO_AUTENTICACAO,
      useExisting: RepositorioAutenticacaoPrisma,
    },
    {
      provide: REPOSITORIO_PAREAMENTO_QR,
      useExisting: RepositorioPareamentoQrPrisma,
    },
    {
      provide: REPOSITORIO_MFA,
      useExisting: RepositorioMfaPrisma,
    },
  ],
})
export class ModuloAutenticacao {}
