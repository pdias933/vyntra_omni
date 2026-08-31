import { Module } from '@nestjs/common';

import { ModuloAuditoria } from '../auditoria/modulo-auditoria.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { ControladorAutenticacaoWeb } from './controlador-autenticacao-web.js';
import { REPOSITORIO_AUTENTICACAO } from './repositorio-autenticacao.js';
import { RepositorioAutenticacaoPrisma } from './repositorio-autenticacao-prisma.js';
import { ServicoAutenticacaoWeb } from './servico-autenticacao-web.js';
import { ServicoOrigemWeb } from './servico-origem-web.js';
import { ServicoSenha } from './servico-senha.js';

@Module({
  controllers: [ControladorAutenticacaoWeb],
  exports: [ServicoAutenticacaoWeb, ServicoOrigemWeb, ServicoSenha],
  imports: [ModuloAuditoria, ModuloPersistencia],
  providers: [
    RepositorioAutenticacaoPrisma,
    ServicoAutenticacaoWeb,
    ServicoOrigemWeb,
    ServicoSenha,
    {
      provide: REPOSITORIO_AUTENTICACAO,
      useExisting: RepositorioAutenticacaoPrisma,
    },
  ],
})
export class ModuloAutenticacao {}
