import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { NotaInternaPersistida } from './modelo-nota-interna.js';
import type { RepositorioNotasInternas } from './repositorio-notas-internas.js';

@Injectable()
export class RepositorioNotasInternasPrisma implements RepositorioNotasInternas {
  public async contextoPermiteNota(
    conversaId: string,
    atendimentoId: string,
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.atendimento.findFirst({
        select: { id: true },
        where: {
          conversaId,
          estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
          filaAtualId: filaId,
          id: atendimentoId,
        },
      })) !== null
    );
  }

  public async acrescentar(
    nota: NotaInternaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.notaInterna.create({ data: nota });
  }
}
