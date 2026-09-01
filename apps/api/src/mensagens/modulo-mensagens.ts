import { Module } from '@nestjs/common';

import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloJanelaCanal } from '../janela-canal/modulo-janela-canal.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_MENSAGENS } from './repositorio-mensagens.js';
import { RepositorioMensagensPrisma } from './repositorio-mensagens-prisma.js';
import { REPOSITORIO_ESTADOS_MENSAGEM } from './repositorio-estados-mensagem.js';
import { RepositorioEstadosMensagemPrisma } from './repositorio-estados-mensagem-prisma.js';
import { ServicoEstadosMensagem } from './servico-estados-mensagem.js';
import { ServicoMensagensSaida } from './servico-mensagens-saida.js';

@Module({
  exports: [ServicoEstadosMensagem, ServicoMensagensSaida],
  imports: [
    ModuloAutorizacao,
    ModuloEventos,
    ModuloJanelaCanal,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioMensagensPrisma,
    RepositorioEstadosMensagemPrisma,
    ServicoEstadosMensagem,
    ServicoMensagensSaida,
    {
      provide: REPOSITORIO_ESTADOS_MENSAGEM,
      useExisting: RepositorioEstadosMensagemPrisma,
    },
    {
      provide: REPOSITORIO_MENSAGENS,
      useExisting: RepositorioMensagensPrisma,
    },
  ],
})
export class ModuloMensagens {}
