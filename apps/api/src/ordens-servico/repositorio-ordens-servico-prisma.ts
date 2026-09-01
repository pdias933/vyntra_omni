import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AtualizacaoOrdemServicoErpPersistida,
  ContextoOrdemServicoErp,
  OrdemServicoErpPersistida,
} from './modelo-ordem-servico.js';
import type {
  NovaAtualizacaoOrdemServicoErp,
  NovaOrdemServicoErp,
  RepositorioOrdensServico,
} from './repositorio-ordens-servico.js';

@Injectable()
export class RepositorioOrdensServicoPrisma
  implements RepositorioOrdensServico
{
  public async contextoEProtocoloCorrespondem(
    contexto: ContextoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atendimento = await transacao.atendimento.findFirst({
      select: { id: true },
      where: {
        contexto: {
          is: {
            clienteExternoAtivoId: contexto.clienteExternoId,
            contratoExternoAtivoId: contexto.contratoExternoId,
            vinculoCliente: { revogadoEm: null },
            vinculoContrato: {
              contratoExternoId: contexto.contratoExternoId,
              revogadoEm: null,
            },
          },
        },
        estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
        filaAtualId: contexto.filaId,
        id: contexto.atendimentoId,
        protocoloErp: {
          is: {
            estado: 'OFICIAL',
            protocoloOficial: contexto.protocoloOficial,
          },
        },
      },
    });
    return atendimento !== null;
  }

  public async obterPorOperacaoCriacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<OrdemServicoErpPersistida | undefined> {
    const ordem = await transacao.ordemServicoErp.findUnique({
      where: { operacaoCriacaoId: operacaoId },
    });
    return ordem === null ? undefined : this.mapear(ordem);
  }

  public async criar(
    ordem: NovaOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.ordemServicoErp.createMany({
      data: {
        assunto: ordem.assunto,
        atendimentoId: ordem.atendimentoId,
        atualizadoEm: ordem.atualizadoEm,
        clienteExternoId: ordem.clienteExternoId,
        confirmadoEm: ordem.confirmadoEm,
        contratoExternoId: ordem.contratoExternoId,
        criadoEm: ordem.criadoEm,
        descricaoHash: ordem.descricaoHash,
        descricaoProtegida: { descricao: ordem.descricao },
        id: ordem.id,
        operacaoCriacaoId: ordem.operacaoCriacaoId,
        ordemServicoExternaId: ordem.ordemServicoExternaId,
        protocoloOficial: ordem.protocoloOficial,
        versao: ordem.versao,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async bloquearOrdem(
    ordemServicoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ordem-servico:${ordemServicoId}`}, 0))`,
    );
  }

  public async obterNoContexto(
    ordemServicoId: string,
    contexto: ContextoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<OrdemServicoErpPersistida | undefined> {
    if (!(await this.contextoEProtocoloCorrespondem(contexto, transacao))) {
      return undefined;
    }
    const ordem = await transacao.ordemServicoErp.findFirst({
      where: {
        atendimentoId: contexto.atendimentoId,
        clienteExternoId: contexto.clienteExternoId,
        contratoExternoId: contexto.contratoExternoId,
        id: ordemServicoId,
        protocoloOficial: contexto.protocoloOficial,
      },
    });
    return ordem === null ? undefined : this.mapear(ordem);
  }

  public async reservarAtualizacao(
    ordemServicoId: string,
    operacaoId: string,
    versaoEsperada: number,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    await transacao.reservaAtualizacaoOrdemServicoErp.createMany({
      data: {
        criadaEm,
        operacaoRecuperavelId: operacaoId,
        ordemServicoId,
        versaoEsperada,
      },
      skipDuplicates: true,
    });
    return this.reservaAtualizacaoPertence(
      ordemServicoId,
      operacaoId,
      transacao,
    );
  }

  public async reservaAtualizacaoPertence(
    ordemServicoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const reserva = await transacao.reservaAtualizacaoOrdemServicoErp.findUnique(
      {
        select: { operacaoRecuperavelId: true },
        where: { ordemServicoId },
      },
    );
    return reserva?.operacaoRecuperavelId === operacaoId;
  }

  public async liberarReservaAtualizacao(
    ordemServicoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado =
      await transacao.reservaAtualizacaoOrdemServicoErp.deleteMany({
        where: { operacaoRecuperavelId: operacaoId, ordemServicoId },
      });
    return resultado.count === 1;
  }

  public async confirmarAtualizacao(
    atualizacao: NovaAtualizacaoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const alteracao = await transacao.ordemServicoErp.updateMany({
      data: {
        assunto: atualizacao.assunto,
        atualizadoEm: atualizacao.confirmadoEm,
        descricaoHash: atualizacao.descricaoHash,
        descricaoProtegida: { descricao: atualizacao.descricao },
        versao: { increment: 1 },
      },
      where: {
        id: atualizacao.ordemServicoId,
        versao: atualizacao.versaoEsperada,
      },
    });
    if (alteracao.count !== 1) return false;
    await transacao.historicoAtualizacaoOrdemServicoErp.create({
      data: {
        confirmadoEm: atualizacao.confirmadoEm,
        conteudoHash: atualizacao.conteudoHash,
        criadoEm: new Date(),
        id: randomUUID(),
        operacaoRecuperavelId: atualizacao.operacaoId,
        ordemServicoId: atualizacao.ordemServicoId,
        versaoAnterior: atualizacao.versaoEsperada,
        versaoResultante: atualizacao.versaoEsperada + 1,
      },
    });
    return true;
  }

  public async obterAtualizacaoPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtualizacaoOrdemServicoErpPersistida | undefined> {
    const atualizacao =
      await transacao.historicoAtualizacaoOrdemServicoErp.findUnique({
        where: { operacaoRecuperavelId: operacaoId },
      });
    return atualizacao === null
      ? undefined
      : {
          confirmadoEm: atualizacao.confirmadoEm,
          ordemServicoId: atualizacao.ordemServicoId,
          versaoResultante: atualizacao.versaoResultante,
        };
  }

  private mapear(ordem: {
    atendimentoId: string;
    atualizadoEm: Date;
    clienteExternoId: string;
    confirmadoEm: Date;
    contratoExternoId: string;
    criadoEm: Date;
    id: string;
    operacaoCriacaoId: string;
    ordemServicoExternaId: string;
    protocoloOficial: string;
    versao: number;
  }): OrdemServicoErpPersistida {
    return {
      atendimentoId: ordem.atendimentoId,
      atualizadoEm: ordem.atualizadoEm,
      clienteExternoId: ordem.clienteExternoId,
      confirmadoEm: ordem.confirmadoEm,
      contratoExternoId: ordem.contratoExternoId,
      criadoEm: ordem.criadoEm,
      id: ordem.id,
      operacaoCriacaoId: ordem.operacaoCriacaoId,
      ordemServicoExternaId: ordem.ordemServicoExternaId,
      protocoloOficial: ordem.protocoloOficial,
      versao: ordem.versao,
    };
  }
}
