import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { NovoEventoDominio } from './modelo-eventos.js';
import type { RepositorioEventoDominio } from './repositorio-evento-dominio.js';

@Injectable()
export class RepositorioEventoDominioPrisma
  implements RepositorioEventoDominio
{
  public async acrescentar(
    evento: NovoEventoDominio,
    transacao: TransacaoPrisma,
  ): Promise<bigint> {
    const persistido = await transacao.eventoDominio.create({
      data: {
        atendimentoId: evento.atendimentoId ?? null,
        classificacaoDados: evento.classificacaoDados,
        conversaId: evento.conversaId ?? null,
        criadoEm: evento.criadoEm,
        dadosProtegidosMinimizados: evento.dadosProtegidosMinimizados,
        entidadeId: evento.entidadeId,
        entidadeTipo: evento.entidadeTipo,
        id: evento.id,
        tipo: evento.tipo,
        usuarioAtorId: evento.usuarioAtorId ?? null,
      },
      select: { sequenciaEvento: true },
    });

    return persistido.sequenciaEvento;
  }
}
