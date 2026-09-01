import { Module } from '@nestjs/common';

import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloEventos } from '../eventos/modulo-eventos.js';
import { ModuloJanelaCanal } from '../janela-canal/modulo-janela-canal.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_MENSAGENS } from './repositorio-mensagens.js';
import { RepositorioMensagensPrisma } from './repositorio-mensagens-prisma.js';
import { ServicoMensagensSaida } from './servico-mensagens-saida.js';

@Module({
  exports: [ServicoMensagensSaida],
  imports: [
    ModuloAutorizacao,
    ModuloEventos,
    ModuloJanelaCanal,
    ModuloPersistencia,
  ],
  providers: [
    RepositorioMensagensPrisma,
    ServicoMensagensSaida,
    {
      provide: REPOSITORIO_MENSAGENS,
      useExisting: RepositorioMensagensPrisma,
    },
  ],
})
export class ModuloMensagens {}
