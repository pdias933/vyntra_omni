import { Module } from '@nestjs/common';

import { ModuloAutorizacao } from '../autorizacao/modulo-autorizacao.js';
import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { REPOSITORIO_DESBLOQUEIOS_CONFIANCA } from './repositorio-desbloqueios-confianca.js';
import { RepositorioDesbloqueiosConfiancaPrisma } from './repositorio-desbloqueios-confianca-prisma.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from './servico-elegibilidade-desbloqueio-confianca.js';

@Module({
  exports: [ServicoElegibilidadeDesbloqueioConfianca],
  imports: [ModuloAutorizacao, ModuloPersistencia],
  providers: [
    RepositorioDesbloqueiosConfiancaPrisma,
    ServicoElegibilidadeDesbloqueioConfianca,
    {
      provide: REPOSITORIO_DESBLOQUEIOS_CONFIANCA,
      useExisting: RepositorioDesbloqueiosConfiancaPrisma,
    },
  ],
})
export class ModuloDesbloqueiosConfianca {}
