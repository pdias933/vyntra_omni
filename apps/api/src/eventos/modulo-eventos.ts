import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_CAIXA_SAIDA } from './repositorio-caixa-saida.js';
import { RepositorioCaixaSaidaPrisma } from './repositorio-caixa-saida-prisma.js';
import { REPOSITORIO_EVENTO_DOMINIO } from './repositorio-evento-dominio.js';
import { RepositorioEventoDominioPrisma } from './repositorio-evento-dominio-prisma.js';
import { ServicoCaixaSaida } from './servico-caixa-saida.js';
import { ServicoEventoDominio } from './servico-evento-dominio.js';
import { ServicoTransacaoDominio } from './servico-transacao-dominio.js';

@Module({
  exports: [ServicoCaixaSaida, ServicoEventoDominio, ServicoTransacaoDominio],
  imports: [ModuloPersistencia],
  providers: [
    RepositorioCaixaSaidaPrisma,
    RepositorioEventoDominioPrisma,
    ServicoCaixaSaida,
    ServicoEventoDominio,
    ServicoTransacaoDominio,
    {
      provide: REPOSITORIO_CAIXA_SAIDA,
      useExisting: RepositorioCaixaSaidaPrisma,
    },
    {
      provide: REPOSITORIO_EVENTO_DOMINIO,
      useExisting: RepositorioEventoDominioPrisma,
    },
  ],
})
export class ModuloEventos {}
