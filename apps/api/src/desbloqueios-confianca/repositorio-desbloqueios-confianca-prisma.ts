import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { UltimoDesbloqueioConfianca } from './modelo-desbloqueio-confianca.js';
import type { RepositorioDesbloqueiosConfianca } from './repositorio-desbloqueios-confianca.js';

@Injectable()
export class RepositorioDesbloqueiosConfiancaPrisma
  implements RepositorioDesbloqueiosConfianca
{
  public async bloquearContrato(
    contratoExternoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`desbloqueio:${contratoExternoId}`}, 0))`,
    );
  }

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

  public async contextoAtivoCorrespondeParaFluxo(
    atendimentoId: string,
    contratoExternoId: string,
    fluxoId: string,
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atendimento = await transacao.atendimento.findFirst({
      select: { id: true },
      where: {
        contexto: {
          is: {
            contratoExternoAtivoId: contratoExternoId,
            vinculoCliente: {
              revogadoEm: null,
              verificadoEm: { not: null },
              OR: [
                { tipo: 'VERIFICADO' },
                {
                  tipo: 'MANUAL',
                  verificadoPorUsuarioId: { not: null },
                },
              ],
            },
            vinculoContrato: {
              contratoExternoId,
              revogadoEm: null,
            },
          },
        },
        estado: 'AGUARDANDO',
        execucoesFluxo: {
          some: { estado: 'EXECUTANDO', fluxoId, versaoFluxoId },
        },
        filaAtualId: null,
        id: atendimentoId,
        modo: 'BOT',
        usuarioResponsavelId: null,
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

  public async obterConfirmadoPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<UltimoDesbloqueioConfianca | undefined> {
    const registro = await transacao.registroDesbloqueioConfianca.findUnique({
      select: { confirmadoEm: true },
      where: { operacaoRecuperavelId: operacaoId },
    });
    return registro === null
      ? undefined
      : { confirmadoEm: registro.confirmadoEm };
  }

  public async reservar(
    contratoExternoId: string,
    atendimentoId: string,
    operacaoId: string,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    await transacao.reservaDesbloqueioConfianca.createMany({
      data: {
        atendimentoId,
        contratoExternoId,
        criadaEm,
        operacaoRecuperavelId: operacaoId,
      },
      skipDuplicates: true,
    });
    return this.reservaPertence(contratoExternoId, operacaoId, transacao);
  }

  public async reservaPertence(
    contratoExternoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const reserva = await transacao.reservaDesbloqueioConfianca.findUnique({
      select: { operacaoRecuperavelId: true },
      where: { contratoExternoId },
    });
    return reserva?.operacaoRecuperavelId === operacaoId;
  }

  public async liberarReserva(
    contratoExternoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.reservaDesbloqueioConfianca.deleteMany({
      where: {
        contratoExternoId,
        operacaoRecuperavelId: operacaoId,
      },
    });
    return resultado.count === 1;
  }

  public async registrarConfirmado(
    atendimentoId: string,
    contratoExternoId: string,
    operacaoId: string,
    confirmadoEm: Date,
    criadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.registroDesbloqueioConfianca.createMany({
      data: {
        atendimentoId,
        confirmadoEm,
        contratoExternoId,
        criadoEm,
        id: randomUUID(),
        operacaoRecuperavelId: operacaoId,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }
}
