import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { FatorMfaPersistido, RepositorioMfa } from './modelo-mfa.js';

@Injectable()
export class RepositorioMfaPrisma implements RepositorioMfa {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async obterFator(
    usuarioId: string,
  ): Promise<FatorMfaPersistido | undefined> {
    const cliente = await this.prisma.obterCliente();
    const fator = await cliente.fatorMfaTotp.findUnique({
      select: {
        codigosRecuperacao: {
          select: { codigoHash: true },
          where: { usadoEm: null },
        },
        estado: true,
        segredoProtegido: true,
        ultimoContadorUsado: true,
      },
      where: { usuarioId },
    });
    if (fator === null) return undefined;
    return {
      codigosRecuperacaoAtivos: fator.codigosRecuperacao.map(
        ({ codigoHash }) => codigoHash,
      ),
      estado: fator.estado,
      segredoProtegido: fator.segredoProtegido,
      ultimoContadorUsado: fator.ultimoContadorUsado,
    };
  }

  public async consumirContadorTotp(
    usuarioId: string,
    contador: bigint,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atualizado = await transacao.fatorMfaTotp.updateMany({
      data: { ultimoContadorUsado: contador },
      where: {
        estado: 'ATIVO',
        usuarioId,
        OR: [
          { ultimoContadorUsado: null },
          { ultimoContadorUsado: { lt: contador } },
        ],
      },
    });
    return atualizado.count === 1;
  }

  public async consumirCodigoRecuperacao(
    usuarioId: string,
    codigoHash: string,
    usadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atualizado = await transacao.codigoRecuperacaoMfa.updateMany({
      data: { usadoEm },
      where: { codigoHash, usadoEm: null, usuarioId },
    });
    return atualizado.count === 1;
  }
}
