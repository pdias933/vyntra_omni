import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { UltimoDesbloqueioConfianca } from './modelo-desbloqueio-confianca.js';
import type { RepositorioDesbloqueiosConfianca } from './repositorio-desbloqueios-confianca.js';

@Injectable()
export class RepositorioDesbloqueiosConfiancaPrisma
  implements RepositorioDesbloqueiosConfianca
{
  public async contextoAtivoCorresponde(
    atendimentoId: string,
    filaId: string,
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atendimento = await transacao.atendimento.findFirst({
      select: { id: true },
      where: {
        contexto: {
          is: {
            contratoExternoAtivoId: contratoExternoId,
            vinculoCliente: { revogadoEm: null },
            vinculoContrato: {
              contratoExternoId,
              revogadoEm: null,
            },
          },
        },
        estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
        filaAtualId: filaId,
        id: atendimentoId,
      },
    });
    return atendimento !== null;
  }

  public async obterUltimoConfirmado(
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<UltimoDesbloqueioConfianca | undefined> {
    const registro = await transacao.registroDesbloqueioConfianca.findFirst({
      orderBy: [{ confirmadoEm: 'desc' }, { id: 'desc' }],
      select: { confirmadoEm: true },
      where: { contratoExternoId },
    });
    return registro === null
      ? undefined
      : { confirmadoEm: registro.confirmadoEm };
  }
}
