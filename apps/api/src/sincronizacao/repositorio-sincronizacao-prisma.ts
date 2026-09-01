import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import { SanitizadorDadosProtegidos } from '../seguranca/sanitizador-dados-protegidos.js';
import type {
  EventoVarridoSincronizacao,
  LimitesRetencaoEventos,
} from './modelo-sincronizacao.js';
import type { RepositorioSincronizacao } from './repositorio-sincronizacao.js';

interface LinhaLimites {
  readonly menor_retida: bigint | null;
  readonly maior: bigint | null;
}

interface LinhaEventoVarrido {
  readonly atendimento_id: string | null;
  readonly autorizado: boolean;
  readonly classificacao_dados: 'DADO_PESSOAL' | 'DADO_SENSIVEL' | 'OPERACIONAL';
  readonly conversa_id: string | null;
  readonly criado_em: Date;
  readonly dados: unknown;
  readonly entidade_id: string;
  readonly entidade_tipo: string;
  readonly id: string;
  readonly pode_ver_dado_sensivel: boolean;
  readonly sequencia_evento: bigint;
  readonly tipo: string;
  readonly usuario_ator_id: string | null;
}

@Injectable()
export class RepositorioSincronizacaoPrisma
  implements RepositorioSincronizacao
{
  private readonly sanitizador = new SanitizadorDadosProtegidos();

  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async obterLimitesRetencao(
    corteRetencao: Date,
  ): Promise<LimitesRetencaoEventos> {
    const cliente = await this.prisma.obterCliente();
    const [linha] = await cliente.$queryRaw<LinhaLimites[]>(Prisma.sql`
      SELECT
        min("sequencia_evento") FILTER (WHERE "criado_em" >= ${corteRetencao}) AS menor_retida,
        max("sequencia_evento") AS maior
      FROM "evento_dominio"
    `);
    return {
      maiorSequencia: linha?.maior ?? 0n,
      menorSequenciaRetida: linha?.menor_retida ?? undefined,
    };
  }

  public async listarEventos(
    usuarioId: string,
    apos: bigint,
    corteRetencao: Date,
    limite: number,
  ): Promise<readonly EventoVarridoSincronizacao[]> {
    const cliente = await this.prisma.obterCliente();
    const linhas = await cliente.$queryRaw<LinhaEventoVarrido[]>(Prisma.sql`
      WITH usuario_atual AS (
        SELECT
          u."id",
          p."papel_base",
          NOT EXISTS (
            SELECT 1 FROM "permissao_perfil" pp
            WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_FILA' AND pp."efeito"='NEGAR'
          ) AND (
            p."papel_base" IN ('ADMINISTRADOR','SUPERVISOR','ATENDENTE') OR EXISTS (
              SELECT 1 FROM "permissao_perfil" pp
              WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_FILA' AND pp."efeito"='CONCEDER'
            )
          ) AS pode_visualizar_fila,
          NOT EXISTS (
            SELECT 1 FROM "permissao_perfil" pp
            WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_DADO_SENSIVEL' AND pp."efeito"='NEGAR'
          ) AND EXISTS (
            SELECT 1 FROM "permissao_perfil" pp
            WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_DADO_SENSIVEL' AND pp."efeito"='CONCEDER'
          ) AS pode_ver_dado_sensivel
        FROM "usuario" u
        JOIN "perfil_acesso" p ON p."id"=u."perfil_id" AND p."estado"='ATIVO'
        WHERE u."id"=${usuarioId}::uuid AND u."estado"='ATIVO'
      ), candidatos AS (
        SELECT e.*
        FROM "evento_dominio" e
        WHERE e."sequencia_evento">${apos} AND e."criado_em">=${corteRetencao}
        ORDER BY e."sequencia_evento"
        LIMIT ${limite}
      ), avaliados AS (
        SELECT c.*, ua."pode_ver_dado_sensivel",
          CASE WHEN c."tipo"='PERMISSOES_ALTERADAS'
            THEN c."entidade_tipo"='USUARIO' AND c."entidade_id"=ua."id"
            ELSE ua."pode_visualizar_fila" AND EXISTS (
              SELECT 1
              FROM "atendimento" a
              JOIN "fila" f ON f."id"=a."fila_atual_id" AND f."estado"='ATIVA'
              WHERE a."id"=c."atendimento_id" AND (
                ua."papel_base"='ADMINISTRADOR' OR EXISTS (
                  SELECT 1 FROM "acesso_usuario_fila" auf
                  WHERE auf."usuario_id"=ua."id" AND auf."fila_id"=f."id" AND auf."estado"='ATIVO'
                )
              )
            )
          END AS autorizado
        FROM candidatos c
        LEFT JOIN usuario_atual ua ON true
      )
      SELECT "id", "sequencia_evento", "tipo", "entidade_tipo", "entidade_id",
        "atendimento_id", "conversa_id", "usuario_ator_id", "classificacao_dados",
        CASE WHEN "autorizado" IS TRUE THEN "dados_protegidos_minimizados" ELSE '{}'::jsonb END AS dados,
        "criado_em", COALESCE("autorizado", false) AS autorizado,
        COALESCE("pode_ver_dado_sensivel", false) AS pode_ver_dado_sensivel
      FROM avaliados ORDER BY "sequencia_evento"
    `);
    return linhas.map((linha) => ({
      autorizado: linha.autorizado,
      evento: {
        atendimentoId: linha.atendimento_id ?? undefined,
        classificacaoDados: linha.classificacao_dados,
        conversaId: linha.conversa_id ?? undefined,
        criadoEm: linha.criado_em,
        dadosProtegidosMinimizados: this.sanitizarDados(linha.dados),
        entidadeId: linha.entidade_id,
        entidadeTipo: linha.entidade_tipo,
        id: linha.id,
        sequenciaEvento: linha.sequencia_evento,
        tipo: linha.tipo,
        usuarioAtorId: linha.usuario_ator_id ?? undefined,
      },
      podeVerDadoSensivel: linha.pode_ver_dado_sensivel,
    }));
  }

  private sanitizarDados(valor: unknown) {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      return {};
    }
    const objeto: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor)) objeto[chave] = item;
    return this.sanitizador.sanitizar(objeto) ?? {};
  }
}
