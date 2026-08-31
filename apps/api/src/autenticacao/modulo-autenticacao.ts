import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
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

@Module({
  controllers: [ControladorAutenticacaoMobile, ControladorAutenticacaoWeb],
  exports: [ServicoAutenticacaoMobile, ServicoAutenticacaoWeb, ServicoOrigemWeb, ServicoSenha],
  imports: [ModuloAuditoria, ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioAutenticacaoPrisma,
    RepositorioAutenticacaoMobilePrisma,
    ServicoAutenticacaoMobile,
    ServicoAutenticacaoWeb,
    ServicoOrigemWeb,
    ServicoSenha,
    {
      provide: REPOSITORIO_AUTENTICACAO_MOBILE,
      useExisting: RepositorioAutenticacaoMobilePrisma,
    },
    {
      provide: REPOSITORIO_AUTENTICACAO,
      useExisting: RepositorioAutenticacaoPrisma,
    },
  ],
})
export class ModuloAutenticacao {}
