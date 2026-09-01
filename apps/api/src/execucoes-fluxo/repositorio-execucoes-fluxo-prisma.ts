import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ValorJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import { ErroExecucaoFluxoInvalida } from './erros-execucao-fluxo.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';
import type { RepositorioExecucoesFluxo } from './repositorio-execucoes-fluxo.js';

const ESTADOS_ATIVOS = [
  'EXECUTANDO',
  'AGUARDANDO_RESPOSTA',
  'AGUARDANDO_SISTEMA',
  'AGUARDANDO_ATENDENTE',
] as const;

@Injectable()
export class RepositorioExecucoesFluxoPrisma
  implements RepositorioExecucoesFluxo
{
  public async criarSeAtendimentoAutomatizavel(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const quantidade = await transacao.$executeRaw(
      Prisma.sql`
        INSERT INTO "execucao_fluxo" (
          "id",
          "atendimento_id",
          "fluxo_id",
          "versao_fluxo_id",
          "estado",
          "no_atual_id",
          "contexto_protegido",
          "revisao",
          "iniciada_em",
          "atualizada_em"
        )
        SELECT
          ${execucao.id}::uuid,
          atendimento."id",
          ${execucao.fluxoId}::uuid,
          ${execucao.versaoFluxoId}::uuid,
          'EXECUTANDO'::"estado_execucao_fluxo",
          ${execucao.noAtualId},
          ${JSON.stringify(execucao.contextoProtegido)}::jsonb,
          ${execucao.revisao},
          ${execucao.iniciadaEm},
          ${execucao.atualizadaEm}
        FROM "atendimento"
        INNER JOIN "fluxo"
          ON fluxo."id" = ${execucao.fluxoId}::uuid
          AND fluxo."ativo" = true
          AND fluxo."versao_publicada_id" = ${execucao.versaoFluxoId}::uuid
        INNER JOIN "versao_fluxo"
          ON versao_fluxo."id" = ${execucao.versaoFluxoId}::uuid
          AND versao_fluxo."fluxo_id" = fluxo."id"
          AND versao_fluxo."estado" = 'PUBLICADA'::"estado_versao_fluxo"
        WHERE atendimento."id" = ${execucao.atendimentoId}::uuid
          AND atendimento."estado" = 'AGUARDANDO'::"estado_atendimento"
          AND atendimento."modo" = 'BOT'::"modo_atendimento"
          AND atendimento."motivo_espera" = 'PROCESSANDO_BOT'::"motivo_espera_atendimento"
          AND atendimento."usuario_responsavel_id" IS NULL
        ON CONFLICT DO NOTHING
      `,
    );
    return quantidade === 1;
  }

  public async obterPorId(
    execucaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ExecucaoFluxoPersistida | undefined> {
    const encontrada = await transacao.execucaoFluxo.findUnique({
      where: { id: execucaoFluxoId },
    });
    return encontrada === null ? undefined : this.mapear(encontrada);
  }

  public async obterAtivaPorAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ExecucaoFluxoPersistida | undefined> {
    const encontrada = await transacao.execucaoFluxo.findFirst({
      where: { atendimentoId, estado: { in: [...ESTADOS_ATIVOS] } },
    });
    return encontrada === null ? undefined : this.mapear(encontrada);
  }

  public async listarRetomadasVencidas(
    limite: number,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<readonly ExecucaoFluxoPersistida[]> {
    const encontradas = await transacao.$queryRaw<
      Array<{
        atendimentoId: string;
        atualizadaEm: Date;
        codigoFinalizacao: string | null;
        contextoProtegido: Prisma.JsonValue;
        estado: ExecucaoFluxoPersistida['estado'];
        finalizadaEm: Date | null;
        fluxoId: string;
        id: string;
        iniciadaEm: Date;
        noAtualId: string;
        retomarEm: Date | null;
        revisao: number;
        versaoFluxoId: string;
      }>
    >(Prisma.sql`
      SELECT
        "atendimento_id" AS "atendimentoId",
        "atualizada_em" AS "atualizadaEm",
        "codigo_finalizacao" AS "codigoFinalizacao",
        "contexto_protegido" AS "contextoProtegido",
        "estado",
        "finalizada_em" AS "finalizadaEm",
        "fluxo_id" AS "fluxoId",
        "id",
        "iniciada_em" AS "iniciadaEm",
        "no_atual_id" AS "noAtualId",
        "retomar_em" AS "retomarEm",
        "revisao",
        "versao_fluxo_id" AS "versaoFluxoId"
      FROM "execucao_fluxo"
      WHERE "estado" = 'AGUARDANDO_SISTEMA'::"estado_execucao_fluxo"
        AND "retomar_em" <= ${agora}
      ORDER BY "retomar_em" ASC, "id" ASC
      LIMIT ${limite}
      FOR UPDATE SKIP LOCKED
    `);
    return encontradas.map((execucao) => this.mapear(execucao));
  }

  public async alterarCondicional(
    proxima: ExecucaoFluxoPersistida,
    estadoEsperado: ExecucaoFluxoPersistida['estado'],
    revisaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.execucaoFluxo.updateMany({
      data: {
        atualizadaEm: proxima.atualizadaEm,
        codigoFinalizacao: proxima.codigoFinalizacao ?? null,
        contextoProtegido: proxima.contextoProtegido,
        estado: proxima.estado,
        finalizadaEm: proxima.finalizadaEm ?? null,
        noAtualId: proxima.noAtualId,
        retomarEm: proxima.retomarEm ?? null,
        revisao: proxima.revisao,
      },
      where: {
        estado: estadoEsperado,
        id: proxima.id,
        revisao: revisaoEsperada,
        versaoFluxoId: proxima.versaoFluxoId,
      },
    });
    return resultado.count === 1;
  }

  private mapear(execucao: {
    readonly atendimentoId: string;
    readonly atualizadaEm: Date;
    readonly codigoFinalizacao: string | null;
    readonly contextoProtegido: Prisma.JsonValue;
    readonly estado: ExecucaoFluxoPersistida['estado'];
    readonly finalizadaEm: Date | null;
    readonly fluxoId: string;
    readonly id: string;
    readonly iniciadaEm: Date;
    readonly noAtualId: string;
    readonly retomarEm: Date | null;
    readonly revisao: number;
    readonly versaoFluxoId: string;
  }): ExecucaoFluxoPersistida {
    if (!this.ehObjetoJsonProtegido(execucao.contextoProtegido)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return {
      atendimentoId: execucao.atendimentoId,
      atualizadaEm: execucao.atualizadaEm,
      contextoProtegido: execucao.contextoProtegido,
      estado: execucao.estado,
      fluxoId: execucao.fluxoId,
      id: execucao.id,
      iniciadaEm: execucao.iniciadaEm,
      noAtualId: execucao.noAtualId,
      revisao: execucao.revisao,
      versaoFluxoId: execucao.versaoFluxoId,
      ...(execucao.codigoFinalizacao === null
        ? {}
        : { codigoFinalizacao: execucao.codigoFinalizacao }),
      ...(execucao.finalizadaEm === null
        ? {}
        : { finalizadaEm: execucao.finalizadaEm }),
      ...(execucao.retomarEm === null ? {} : { retomarEm: execucao.retomarEm }),
    };
  }

  private ehObjetoJsonProtegido(
    valor: unknown,
  ): valor is ExecucaoFluxoPersistida['contextoProtegido'] {
    return (
      valor !== null &&
      typeof valor === 'object' &&
      !Array.isArray(valor) &&
      Object.values(valor).every((item) => this.ehValorJson(item, 1))
    );
  }

  private ehValorJson(
    valor: unknown,
    profundidade: number,
  ): valor is ValorJsonProtegido {
    if (profundidade > 20) return false;
    if (
      valor === null ||
      typeof valor === 'boolean' ||
      typeof valor === 'string'
    ) {
      return true;
    }
    if (typeof valor === 'number') return Number.isFinite(valor);
    if (Array.isArray(valor)) {
      return valor.every((item) => this.ehValorJson(item, profundidade + 1));
    }
    return (
      typeof valor === 'object' &&
      Object.values(valor).every((item) =>
        this.ehValorJson(item, profundidade + 1),
      )
    );
  }
}
