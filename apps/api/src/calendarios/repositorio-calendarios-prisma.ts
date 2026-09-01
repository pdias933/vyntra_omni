import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  CalendarioComposto,
  OverrideCalendarioPersistido,
} from './modelo-calendario.js';
import type { RepositorioCalendarios } from './repositorio-calendarios.js';

@Injectable()
export class RepositorioCalendariosPrisma implements RepositorioCalendarios {
  public async bloquear(
    calendarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`calendario\u0000${calendarioId}`}, 0))`,
    );
  }

  public async obter(
    calendarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<CalendarioComposto | undefined> {
    const calendario = await transacao.calendarioAtendimento.findUnique({
      include: {
        excecoes: { include: { periodos: true } },
        feriados: true,
        overrides: true,
        periodosSemanais: true,
      },
      where: { id: calendarioId },
    });
    if (calendario === null) return undefined;
    return {
      excecoes: calendario.excecoes.map((excecao) => ({
        dataLocal: excecao.dataLocal.toISOString().slice(0, 10),
        diaInteiro: excecao.diaInteiro,
        estado: excecao.estado,
        periodos: excecao.periodos,
      })),
      feriados: calendario.feriados.map(({ dataLocal }) =>
        dataLocal.toISOString().slice(0, 10),
      ),
      fusoHorario: calendario.fusoHorario,
      id: calendario.id,
      modo: calendario.modo,
      nome: calendario.nome,
      overrides: calendario.overrides,
      periodosSemanais: calendario.periodosSemanais,
      versao: calendario.versao,
      ...(calendario.contaWhatsAppId === null
        ? {}
        : { contaWhatsAppId: calendario.contaWhatsAppId }),
      ...(calendario.filaId === null ? {} : { filaId: calendario.filaId }),
    };
  }

  public async existeOverrideSobreposto(
    calendarioId: string,
    vigenteDe: Date,
    vigenteAte: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.overrideCalendario.findFirst({
        select: { id: true },
        where: {
          calendarioId,
          vigenteAte: { gt: vigenteDe },
          vigenteDe: { lt: vigenteAte },
        },
      })) !== null
    );
  }

  public async criarOverride(
    override: OverrideCalendarioPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.overrideCalendario.create({ data: override });
  }
}
