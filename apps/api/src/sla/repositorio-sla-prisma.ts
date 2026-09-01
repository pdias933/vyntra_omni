import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlertaSlaEmitido,
  ContextoObrigacaoHumana,
  NivelAlertaSla,
  RelogioSlaPersistido,
} from './modelo-sla.js';
import type { RepositorioSla } from './repositorio-sla.js';

@Injectable()
export class RepositorioSlaPrisma implements RepositorioSla {
  public async bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sla\u0000${atendimentoId}`}, 0))`,
    );
  }

  public async obterContextoObrigacaoHumana(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoObrigacaoHumana | 'SEM_POLITICA' | undefined> {
    const atendimento = await transacao.atendimento.findUnique({
      include: { filaAtual: { include: { politicaSla: true } } },
      where: { id: atendimentoId },
    });
    if (atendimento === null || atendimento.filaAtual === null) return undefined;
    if (atendimento.filaAtual.politicaSla === null) return 'SEM_POLITICA';
    if (
      !['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atendimento.estado) ||
      !['FILA_HUMANA', 'HUMANO'].includes(atendimento.modo)
    ) return undefined;
    const politica = atendimento.filaAtual.politicaSla;
    return {
      atendimentoId: atendimento.id,
      conversaId: atendimento.conversaId,
      estado: atendimento.estado as 'AGUARDANDO' | 'EM_ATENDIMENTO',
      filaId: atendimento.filaAtual.id,
      modo: atendimento.modo as 'FILA_HUMANA' | 'HUMANO',
      politica: {
        alertaAdministradorAposMinutos: politica.alertaAdministradorAposMinutos,
        alertaAtendenteAposMinutos: politica.alertaAtendenteAposMinutos,
        alertaSupervisorAposMinutos: politica.alertaSupervisorAposMinutos,
        filaId: politica.filaId,
        id: politica.id,
        versao: politica.versao,
      },
    };
  }

  public async obterRelogioAtivo(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<RelogioSlaPersistido | undefined> {
    const relogio = await transacao.relogioSlaAtendimento.findFirst({
      where: { atendimentoId, finalizadoEm: null },
    });
    return relogio === null ? undefined : this.mapearRelogio(relogio);
  }

  public async proximoNumeroCiclo(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    const resultado = await transacao.relogioSlaAtendimento.aggregate({
      _max: { numeroCiclo: true },
      where: { atendimentoId },
    });
    return (resultado._max.numeroCiclo ?? 0) + 1;
  }

  public async criarRelogio(
    relogio: RelogioSlaPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.relogioSlaAtendimento.create({
      data: {
        alertaAdministradorEm: relogio.alertaAdministradorEm,
        alertaAtendenteEm: relogio.alertaAtendenteEm,
        alertaSupervisorEm: relogio.alertaSupervisorEm,
        atendimentoId: relogio.atendimentoId,
        id: relogio.id,
        numeroCiclo: relogio.numeroCiclo,
        obrigacaoHumanaEm: relogio.obrigacaoHumanaEm,
        politicaSlaId: relogio.politicaSlaId,
        versao: relogio.versao,
      },
    });
  }

  public async registrarAlerta(
    alerta: AlertaSlaEmitido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.alertaSla.createMany({
      data: [alerta],
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async alertaJaEmitido(
    relogioSlaId: string,
    nivel: NivelAlertaSla,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.alertaSla.findUnique({
        select: { id: true },
        where: { relogioSlaId_nivel: { nivel, relogioSlaId } },
      })) !== null
    );
  }

  public async concluirRelogio(
    relogioSlaId: string,
    finalizadoEm: Date,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.relogioSlaAtendimento.updateMany({
      data: { finalizadoEm, versao: { increment: 1 } },
      where: { finalizadoEm: null, id: relogioSlaId, versao: versaoEsperada },
    });
    return resultado.count === 1;
  }

  private mapearRelogio(relogio: {
    id: string;
    atendimentoId: string;
    politicaSlaId: string;
    numeroCiclo: number;
    obrigacaoHumanaEm: Date;
    alertaAtendenteEm: Date;
    alertaSupervisorEm: Date;
    alertaAdministradorEm: Date;
    finalizadoEm: Date | null;
    versao: number;
  }): RelogioSlaPersistido {
    return {
      alertaAdministradorEm: relogio.alertaAdministradorEm,
      alertaAtendenteEm: relogio.alertaAtendenteEm,
      alertaSupervisorEm: relogio.alertaSupervisorEm,
      atendimentoId: relogio.atendimentoId,
      id: relogio.id,
      numeroCiclo: relogio.numeroCiclo,
      obrigacaoHumanaEm: relogio.obrigacaoHumanaEm,
      politicaSlaId: relogio.politicaSlaId,
      versao: relogio.versao,
      ...(relogio.finalizadoEm === null ? {} : { finalizadoEm: relogio.finalizadoEm }),
    };
  }
}
