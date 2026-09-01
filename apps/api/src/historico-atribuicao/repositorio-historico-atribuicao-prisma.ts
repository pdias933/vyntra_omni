import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AtribuicaoAtualAtendimento,
  HistoricoAtribuicaoPersistido,
} from './modelo-historico-atribuicao.js';
import type { RepositorioHistoricoAtribuicao } from './repositorio-historico-atribuicao.js';

@Injectable()
export class RepositorioHistoricoAtribuicaoPrisma
  implements RepositorioHistoricoAtribuicao
{
  public async bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`historico-atribuicao:${atendimentoId}`}, 0))`,
    );
  }

  public async obterAtribuicaoAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtribuicaoAtualAtendimento | undefined> {
    const atendimento = await transacao.atendimento.findUnique({
      select: { filaAtualId: true, usuarioResponsavelId: true },
      where: { id: atendimentoId },
    });
    if (atendimento === null) return undefined;
    return {
      ...(atendimento.filaAtualId === null
        ? {}
        : { filaId: atendimento.filaAtualId }),
      ...(atendimento.usuarioResponsavelId === null
        ? {}
        : { usuarioResponsavelId: atendimento.usuarioResponsavelId }),
    };
  }

  public async obterAberto(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<HistoricoAtribuicaoPersistido | undefined> {
    const historico = await transacao.historicoAtribuicao.findFirst({
      where: { atendimentoId, finalizadoEm: null },
    });
    if (historico === null) return undefined;
    return {
      atendimentoId: historico.atendimentoId,
      filaId: historico.filaId!,
      id: historico.id,
      iniciadoEm: historico.iniciadoEm,
      tipo: historico.tipo,
      ...(historico.usuarioResponsavelId === null
        ? {}
        : { usuarioResponsavelId: historico.usuarioResponsavelId }),
      ...(historico.executadoPorUsuarioId === null
        ? {}
        : { executadoPorUsuarioId: historico.executadoPorUsuarioId }),
    };
  }

  public async criar(
    historico: HistoricoAtribuicaoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.historicoAtribuicao.createMany({
      data: {
        atendimentoId: historico.atendimentoId,
        executadoPorUsuarioId: historico.executadoPorUsuarioId ?? null,
        filaId: historico.filaId,
        finalizadoEm: null,
        id: historico.id,
        iniciadoEm: historico.iniciadoEm,
        tipo: historico.tipo,
        usuarioResponsavelId: historico.usuarioResponsavelId ?? null,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async finalizar(
    historicoId: string,
    finalizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.historicoAtribuicao.updateMany({
      data: { finalizadoEm },
      where: { finalizadoEm: null, id: historicoId },
    });
    return resultado.count === 1;
  }
}
