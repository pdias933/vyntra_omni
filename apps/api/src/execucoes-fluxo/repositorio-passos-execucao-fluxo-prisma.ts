import { Injectable } from '@nestjs/common';

import type { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { PassoExecucaoFluxoPersistido } from './modelo-passo-execucao-fluxo.js';
import type { RepositorioPassosExecucaoFluxo } from './repositorio-passos-execucao-fluxo.js';

@Injectable()
export class RepositorioPassosExecucaoFluxoPrisma
  implements RepositorioPassosExecucaoFluxo
{
  public async iniciar(
    passo: PassoExecucaoFluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.passoExecucaoFluxo.createMany({
      data: passo as unknown as Prisma.PassoExecucaoFluxoUncheckedCreateInput,
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async finalizar(
    passo: PassoExecucaoFluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.passoExecucaoFluxo.updateMany({
      data: {
        codigoErro: passo.codigoErro ?? null,
        estado: passo.estado,
        finalizadoEm: passo.finalizadoEm ?? null,
        saidaSanitizada: passo.saidaSanitizada as Prisma.InputJsonValue,
      },
      where: {
        estado: 'INICIADO',
        execucaoFluxoId: passo.execucaoFluxoId,
        id: passo.id,
        revisaoExecucao: passo.revisaoExecucao,
      },
    });
    return resultado.count === 1;
  }
}
