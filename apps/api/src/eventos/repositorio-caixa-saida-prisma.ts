import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ItemCaixaSaida } from './modelo-eventos.js';
import type { RepositorioCaixaSaida } from './repositorio-caixa-saida.js';

@Injectable()
export class RepositorioCaixaSaidaPrisma implements RepositorioCaixaSaida {
  public async acrescentar(
    item: ItemCaixaSaida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.itemCaixaSaida.create({
      data: {
        criadoEm: item.criadoEm,
        dadosProtegidosMinimizados: item.dadosProtegidosMinimizados,
        destino: item.destino,
        disponivelEm: item.disponivelEm,
        estado: item.estado,
        eventoDominioId: item.eventoDominioId,
        id: item.id,
        tipo: item.tipo,
      },
      select: { id: true },
    });
  }
}
