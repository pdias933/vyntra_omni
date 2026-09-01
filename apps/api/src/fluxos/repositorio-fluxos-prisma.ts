import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  DefinicaoFluxo,
  FluxoPersistido,
  VersaoFluxoPersistida,
} from './modelo-fluxo.js';
import type { RepositorioFluxos } from './repositorio-fluxos.js';

@Injectable()
export class RepositorioFluxosPrisma implements RepositorioFluxos {
  public async bloquearNome(
    nomeNormalizado: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`fluxo:nome:${nomeNormalizado}`, transacao);
  }

  public async bloquearFluxo(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`fluxo:${fluxoId}`, transacao);
  }

  public async bloquearVersao(
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`versao-fluxo:${versaoFluxoId}`, transacao);
  }

  public async criarFluxo(
    fluxo: FluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.fluxo.createMany({
      data: {
        ativo: fluxo.ativo,
        atualizadoEm: fluxo.atualizadoEm,
        criadoEm: fluxo.criadoEm,
        criadoPorUsuarioId: fluxo.criadoPorUsuarioId,
        descricao: fluxo.descricao ?? null,
        id: fluxo.id,
        nome: fluxo.nome,
        nomeNormalizado: fluxo.nomeNormalizado,
        revisao: fluxo.revisao,
        tipo: fluxo.tipo,
        versaoPublicadaId: fluxo.versaoPublicadaId ?? null,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async criarVersao(
    versao: VersaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.versaoFluxo.createMany({
      data: {
        atualizadaEm: versao.atualizadaEm,
        criadaEm: versao.criadaEm,
        criadaPorUsuarioId: versao.criadaPorUsuarioId,
        definicao: versao.definicao,
        estado: versao.estado,
        fluxoId: versao.fluxoId,
        id: versao.id,
        numeroVersao: versao.numeroVersao,
        publicadaEm: versao.publicadaEm ?? null,
        publicadaPorUsuarioId: versao.publicadaPorUsuarioId ?? null,
        revisao: versao.revisao,
        versaoSchemaDefinicao: versao.versaoSchemaDefinicao,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async obterFluxo(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<FluxoPersistido | undefined> {
    const fluxo = await transacao.fluxo.findUnique({ where: { id: fluxoId } });
    if (fluxo === null) return undefined;
    return {
      ativo: fluxo.ativo,
      atualizadoEm: fluxo.atualizadoEm,
      criadoEm: fluxo.criadoEm,
      criadoPorUsuarioId: fluxo.criadoPorUsuarioId,
      ...(fluxo.descricao === null ? {} : { descricao: fluxo.descricao }),
      id: fluxo.id,
      nome: fluxo.nome,
      nomeNormalizado: fluxo.nomeNormalizado,
      revisao: fluxo.revisao,
      tipo: fluxo.tipo,
      ...(fluxo.versaoPublicadaId === null
        ? {}
        : { versaoPublicadaId: fluxo.versaoPublicadaId }),
    };
  }

  public async obterVersao(
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida | undefined> {
    const versao = await transacao.versaoFluxo.findUnique({
      where: { id: versaoFluxoId },
    });
    return versao === null ? undefined : this.mapearVersao(versao);
  }

  public async obterProximoNumeroVersao(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    const resultado = await transacao.versaoFluxo.aggregate({
      _max: { numeroVersao: true },
      where: { fluxoId },
    });
    return (resultado._max.numeroVersao ?? 0) + 1;
  }

  public async alterarRascunho(
    versao: VersaoFluxoPersistida,
    revisaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.versaoFluxo.updateMany({
      data: {
        atualizadaEm: versao.atualizadaEm,
        definicao: versao.definicao,
        revisao: versao.revisao,
        versaoSchemaDefinicao: versao.versaoSchemaDefinicao,
      },
      where: {
        estado: 'RASCUNHO',
        id: versao.id,
        revisao: revisaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  public async obterVersaoPublicada(
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida | undefined> {
    const fluxo = await transacao.fluxo.findFirst({
      select: { versaoPublicadaId: true },
      where: { ativo: true, id: fluxoId },
    });
    if (fluxo?.versaoPublicadaId === null || fluxo === null) return undefined;
    const versao = await transacao.versaoFluxo.findFirst({
      where: {
        estado: 'PUBLICADA',
        fluxoId,
        id: fluxo.versaoPublicadaId,
      },
    });
    return versao === null ? undefined : this.mapearVersao(versao);
  }

  private mapearVersao(versao: {
    readonly atualizadaEm: Date;
    readonly criadaEm: Date;
    readonly criadaPorUsuarioId: string;
    readonly definicao: unknown;
    readonly estado: VersaoFluxoPersistida['estado'];
    readonly fluxoId: string;
    readonly id: string;
    readonly numeroVersao: number;
    readonly publicadaEm: Date | null;
    readonly publicadaPorUsuarioId: string | null;
    readonly revisao: number;
    readonly versaoSchemaDefinicao: number;
  }): VersaoFluxoPersistida {
    if (!this.ehDefinicaoFluxo(versao.definicao)) {
      throw new Error('DEFINICAO_FLUXO_INCONSISTENTE');
    }
    return {
      atualizadaEm: versao.atualizadaEm,
      criadaEm: versao.criadaEm,
      criadaPorUsuarioId: versao.criadaPorUsuarioId,
      definicao: versao.definicao,
      estado: versao.estado,
      fluxoId: versao.fluxoId,
      id: versao.id,
      numeroVersao: versao.numeroVersao,
      ...(versao.publicadaEm === null
        ? {}
        : { publicadaEm: versao.publicadaEm }),
      ...(versao.publicadaPorUsuarioId === null
        ? {}
        : { publicadaPorUsuarioId: versao.publicadaPorUsuarioId }),
      revisao: versao.revisao,
      versaoSchemaDefinicao: versao.versaoSchemaDefinicao,
    };
  }

  private ehDefinicaoFluxo(valor: unknown): valor is DefinicaoFluxo {
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  }

  private async bloquear(
    chave: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`,
    );
  }
}
