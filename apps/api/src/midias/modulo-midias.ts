import { Module } from '@nestjs/common';

import { ModuloPersistencia } from '../persistencia/modulo-persistencia.js';
import { AdaptadorArmazenamentoS3 } from './adaptador-armazenamento-s3.js';
import { PORTA_ARMAZENAMENTO_PRIVADO } from './porta-armazenamento-privado.js';
import { RepositorioMidiasPrisma } from './repositorio-midias-prisma.js';
import { REPOSITORIO_MIDIAS } from './repositorio-midias.js';
import { ServicoMidias } from './servico-midias.js';

@Module({
  exports: [ServicoMidias],
  imports: [ModuloPersistencia],
  providers: [
    AdaptadorArmazenamentoS3,
    RepositorioMidiasPrisma,
    ServicoMidias,
    { provide: PORTA_ARMAZENAMENTO_PRIVADO, useExisting: AdaptadorArmazenamentoS3 },
    { provide: REPOSITORIO_MIDIAS, useExisting: RepositorioMidiasPrisma },
  ],
})
export class ModuloMidias {}
