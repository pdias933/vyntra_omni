import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ProtocoloErpPersistido } from './modelo-protocolo-erp.js';
import type { RepositorioProtocolosErp } from './repositorio-protocolos-erp.js';

@Injectable()
export class RepositorioProtocolosErpPrisma
  implements RepositorioProtocolosErp
{
  public async atendimentoExiste(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.atendimento.findUnique({
        select: { id: true },
        where: { id: atendimentoId },
      })) !== null
    );
  }

  public async obter(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ProtocoloErpPersistido | undefined> {
    const protocolo = await transacao.protocoloErp.findUnique({
      where: { atendimentoId },
    });
    if (protocolo === null) return undefined;
    return {
      atendimentoId: protocolo.atendimentoId,
      atualizadoEm: protocolo.atualizadoEm,
      criadoEm: protocolo.criadoEm,
      estado: protocolo.estado,
      versao: protocolo.versao,
      ...(protocolo.confirmadoEm === null
        ? {}
        : { confirmadoEm: protocolo.confirmadoEm }),
      ...(protocolo.protocoloOficial === null
        ? {}
        : { protocoloOficial: protocolo.protocoloOficial }),
    };
  }

  public async criarPendente(
    protocolo: ProtocoloErpPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.protocoloErp.createMany({
      data: {
        atendimentoId: protocolo.atendimentoId,
        atualizadoEm: protocolo.atualizadoEm,
        confirmadoEm: protocolo.confirmadoEm ?? null,
        criadoEm: protocolo.criadoEm,
        estado: protocolo.estado,
        protocoloOficial: protocolo.protocoloOficial ?? null,
        versao: protocolo.versao,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async confirmar(
    protocolo: ProtocoloErpPersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.protocoloErp.updateMany({
      data: {
        atualizadoEm: protocolo.atualizadoEm,
        confirmadoEm: protocolo.confirmadoEm ?? null,
        estado: protocolo.estado,
        protocoloOficial: protocolo.protocoloOficial ?? null,
        versao: protocolo.versao,
      },
      where: {
        atendimentoId: protocolo.atendimentoId,
        estado: 'PENDENTE',
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
  }
}
