import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  MATRIZ_PERMISSOES_BASE,
} from '../autorizacao/matriz-permissoes.js';
import type {
  CodigoPermissaoAutorizacao,
  PapelBaseAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';
import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { SanitizadorDadosProtegidos } from '../seguranca/sanitizador-dados-protegidos.js';
import type {
  AtendimentoSnapshotSincronizacao,
  ConversaSnapshotSincronizacao,
  FilaSnapshotSincronizacao,
  MensagemSnapshotSincronizacao,
  NotaInternaSnapshotSincronizacao,
  SnapshotSincronizacaoCompleta,
} from './modelo-sincronizacao.js';
import type { RepositorioRessincronizacao } from './repositorio-ressincronizacao.js';

interface LinhaSequenciaBase {
  readonly sequencia_base: bigint | null;
}

interface LinhaFila {
  readonly id: string;
  readonly nome: string;
}

interface LinhaAtendimento {
  readonly atualizado_em: Date;
  readonly conta_origem_id: string;
  readonly conversa_id: string;
  readonly estado: string;
  readonly fila_id: string;
  readonly id: string;
  readonly modo: string;
  readonly motivo_espera: string;
  readonly usuario_responsavel_id: string | null;
  readonly versao_atribuicao: number;
  readonly versao_estado: number;
}

interface LinhaConversa {
  readonly contato_id: string;
  readonly id: string;
  readonly ultima_atividade_em: Date;
  readonly versao: number;
}

interface LinhaMensagem {
  readonly atendimento_id: string;
  readonly conta_origem_id: string;
  readonly conteudo: unknown;
  readonly conversa_id: string;
  readonly direcao: string;
  readonly estado_saida: string | null;
  readonly id: string;
  readonly mensagem_alvo_reacao_id: string | null;
  readonly recebida_servidor_em: Date;
  readonly responde_a_mensagem_id: string | null;
  readonly tipo: string;
  readonly versao: number;
}

interface LinhaNotaInterna {
  readonly atendimento_id: string;
  readonly autor_usuario_id: string;
  readonly conteudo: unknown;
  readonly conversa_id: string;
  readonly criada_em: Date;
  readonly id: string;
}

@Injectable()
export class RepositorioRessincronizacaoPrisma
  implements RepositorioRessincronizacao
{
  private readonly sanitizador = new SanitizadorDadosProtegidos();

  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async criarSnapshotAutorizado(
    usuarioId: string,
    geradoEm: Date,
  ): Promise<SnapshotSincronizacaoCompleta | undefined> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const [linhaSequencia] = await transacao.$queryRaw<LinhaSequenciaBase[]>(
        Prisma.sql`SELECT max("sequencia_evento") AS sequencia_base FROM "evento_dominio"`,
      );
      const contexto = await transacao.usuario.findUnique({
        select: {
          estado: true,
          versaoPermissoes: true,
          perfil: {
            select: {
              estado: true,
              papelBase: true,
              permissoes: { select: { codigo: true, efeito: true } },
            },
          },
        },
        where: { id: usuarioId },
      });
      if (
        contexto?.estado !== 'ATIVO' ||
        contexto.perfil?.estado !== 'ATIVO'
      ) {
        return undefined;
      }

      const [filas, atendimentos, conversas, mensagens, notas, controles, politicas] =
        await Promise.all([
          this.listarFilas(usuarioId, transacao),
          this.listarAtendimentos(usuarioId, transacao),
          this.listarConversas(usuarioId, transacao),
          this.listarMensagens(usuarioId, transacao),
          this.listarNotasInternas(usuarioId, transacao),
          transacao.controleRecurso.findMany({
            orderBy: { codigo: 'asc' },
            select: {
              codigo: true,
              desligadoEmergencialmente: true,
              estado: true,
              filas: {
                select: { filaId: true },
                where: {
                  fila: {
                    acessosUsuarios: {
                      some: { estado: 'ATIVO', usuarioId },
                    },
                    estado: 'ATIVA',
                  },
                },
              },
              liberarAdministradores: true,
              percentualLiberacao: true,
              usuarios: {
                select: { usuarioId: true },
                where: { usuarioId },
              },
              versao: true,
            },
          }),
          transacao.politicaVersaoMobile.findMany({
            orderBy: { plataforma: 'asc' },
            select: {
              plataforma: true,
              versao: true,
              versaoMinima: true,
              versaoRecomendada: true,
            },
          }),
        ]);

      const controlesRecurso: Record<string, boolean> = {};
      for (const controle of controles) {
        controlesRecurso[controle.codigo] =
          controle.estado === 'ATIVADO' &&
          !controle.desligadoEmergencialmente &&
          ((controle.liberarAdministradores &&
            contexto.perfil.papelBase === 'ADMINISTRADOR') ||
            controle.usuarios.length > 0 ||
            controle.filas.length > 0 ||
            this.estaNoPercentual(
              controle.codigo,
              usuarioId,
              controle.percentualLiberacao,
            ));
      }

      return {
        atendimentos,
        controlesRecurso,
        conversas,
        filas,
        geradoEm: geradoEm.toISOString(),
        mensagensRecentes: mensagens,
        notasInternasRecentes: notas,
        permissoes: this.calcularPermissoes(
          contexto.perfil.papelBase,
          contexto.perfil.permissoes,
        ),
        politicasVersao: politicas,
        sequenciaBase: (linhaSequencia?.sequencia_base ?? 0n).toString(),
        versaoPermissoes: contexto.versaoPermissoes,
      };
    });
  }

  private autorizacaoFilas(usuarioId: string): Prisma.Sql {
    return Prisma.sql`
      WITH usuario_atual AS (
        SELECT u."id", p."papel_base",
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
            WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_NOTA_INTERNA' AND pp."efeito"='NEGAR'
          ) AND (
            p."papel_base" IN ('SUPERVISOR','ATENDENTE') OR EXISTS (
              SELECT 1 FROM "permissao_perfil" pp
              WHERE pp."perfil_id"=p."id" AND pp."codigo"='VISUALIZAR_NOTA_INTERNA' AND pp."efeito"='CONCEDER'
            )
          ) AS pode_visualizar_nota
        FROM "usuario" u
        JOIN "perfil_acesso" p ON p."id"=u."perfil_id" AND p."estado"='ATIVO'
        WHERE u."id"=${usuarioId}::uuid AND u."estado"='ATIVO'
      ), filas_autorizadas AS (
        SELECT f."id", f."nome"
        FROM "fila" f CROSS JOIN usuario_atual ua
        WHERE f."estado"='ATIVA' AND ua."pode_visualizar_fila" AND (
          ua."papel_base"='ADMINISTRADOR' OR EXISTS (
            SELECT 1 FROM "acesso_usuario_fila" auf
            WHERE auf."usuario_id"=ua."id" AND auf."fila_id"=f."id" AND auf."estado"='ATIVO'
          )
        )
      ), conversas_autorizadas AS (
        SELECT c."id", c."contato_id", c."ultima_atividade_em", c."versao"
        FROM "conversa" c
        WHERE EXISTS (
          SELECT 1 FROM "atendimento" a
          JOIN filas_autorizadas fa ON fa."id"=a."fila_atual_id"
          WHERE a."conversa_id"=c."id" AND a."estado"<>'ENCERRADO'
        )
        ORDER BY c."ultima_atividade_em" DESC, c."id"
        LIMIT 200
      )
    `;
  }

  private async listarFilas(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly FilaSnapshotSincronizacao[]> {
    return transacao.$queryRaw<LinhaFila[]>(Prisma.sql`
      ${this.autorizacaoFilas(usuarioId)}
      SELECT "id", "nome" FROM filas_autorizadas ORDER BY "nome", "id"
    `);
  }

  private async listarAtendimentos(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly AtendimentoSnapshotSincronizacao[]> {
    const linhas = await transacao.$queryRaw<LinhaAtendimento[]>(Prisma.sql`
      ${this.autorizacaoFilas(usuarioId)}
      SELECT a."id", a."conversa_id", a."conta_whatsapp_origem_id" AS conta_origem_id,
        a."estado"::text, a."modo"::text, a."motivo_espera"::text,
        a."fila_atual_id" AS fila_id, a."usuario_responsavel_id",
        a."versao_estado", a."versao_atribuicao", a."atualizado_em"
      FROM "atendimento" a
      JOIN filas_autorizadas fa ON fa."id"=a."fila_atual_id"
      WHERE a."estado"<>'ENCERRADO'
      ORDER BY a."atualizado_em" DESC, a."id"
    `);
    return linhas.map((linha) => ({
      atualizadoEm: linha.atualizado_em.toISOString(),
      contaOrigemId: linha.conta_origem_id,
      conversaId: linha.conversa_id,
      estado: linha.estado,
      filaId: linha.fila_id,
      id: linha.id,
      modo: linha.modo,
      motivoEspera: linha.motivo_espera,
      ...(linha.usuario_responsavel_id === null
        ? {}
        : { usuarioResponsavelId: linha.usuario_responsavel_id }),
      versaoAtribuicao: linha.versao_atribuicao,
      versaoEstado: linha.versao_estado,
    }));
  }

  private async listarConversas(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly ConversaSnapshotSincronizacao[]> {
    const linhas = await transacao.$queryRaw<LinhaConversa[]>(Prisma.sql`
      ${this.autorizacaoFilas(usuarioId)}
      SELECT "id", "contato_id", "ultima_atividade_em", "versao"
      FROM conversas_autorizadas ORDER BY "ultima_atividade_em" DESC, "id"
    `);
    return linhas.map((linha) => ({
      contatoId: linha.contato_id,
      id: linha.id,
      ultimaAtividadeEm: linha.ultima_atividade_em.toISOString(),
      versao: linha.versao,
    }));
  }

  private async listarMensagens(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly MensagemSnapshotSincronizacao[]> {
    const linhas = await transacao.$queryRaw<LinhaMensagem[]>(Prisma.sql`
      ${this.autorizacaoFilas(usuarioId)}, mensagens_ordenadas AS (
        SELECT m.*, row_number() OVER (
          PARTITION BY m."conversa_id"
          ORDER BY m."recebida_servidor_em" DESC, m."id" DESC
        ) AS posicao
        FROM "mensagem" m
        JOIN conversas_autorizadas ca ON ca."id"=m."conversa_id"
      )
      SELECT "id", "conversa_id", "atendimento_id", "conta_whatsapp_id" AS conta_origem_id,
        "direcao"::text, "tipo"::text, "estado_saida"::text, "conteudo_protegido" AS conteudo,
        "responde_a_mensagem_id", "mensagem_alvo_reacao_id", "recebida_servidor_em", "versao"
      FROM mensagens_ordenadas WHERE posicao<=200
      ORDER BY "conversa_id", "recebida_servidor_em", "id"
    `);
    return linhas.map((linha) => ({
      atendimentoId: linha.atendimento_id,
      contaOrigemId: linha.conta_origem_id,
      conteudo: this.sanitizar(linha.conteudo),
      conversaId: linha.conversa_id,
      direcao: linha.direcao,
      ...(linha.estado_saida === null ? {} : { estadoSaida: linha.estado_saida }),
      id: linha.id,
      ...(linha.mensagem_alvo_reacao_id === null
        ? {}
        : { mensagemAlvoReacaoId: linha.mensagem_alvo_reacao_id }),
      recebidaServidorEm: linha.recebida_servidor_em.toISOString(),
      ...(linha.responde_a_mensagem_id === null
        ? {}
        : { respondeAMensagemId: linha.responde_a_mensagem_id }),
      tipo: linha.tipo,
      versao: linha.versao,
    }));
  }

  private async listarNotasInternas(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly NotaInternaSnapshotSincronizacao[]> {
    const linhas = await transacao.$queryRaw<LinhaNotaInterna[]>(Prisma.sql`
      ${this.autorizacaoFilas(usuarioId)}, notas_ordenadas AS (
        SELECT n.*, row_number() OVER (
          PARTITION BY n."conversa_id" ORDER BY n."criada_em" DESC, n."id" DESC
        ) AS posicao
        FROM "nota_interna" n
        JOIN conversas_autorizadas ca ON ca."id"=n."conversa_id"
        CROSS JOIN usuario_atual ua
        WHERE ua."pode_visualizar_nota"
      )
      SELECT "id", "conversa_id", "atendimento_id", "autor_usuario_id",
        "conteudo_protegido" AS conteudo, "criada_em"
      FROM notas_ordenadas WHERE posicao<=200
      ORDER BY "conversa_id", "criada_em", "id"
    `);
    return linhas.map((linha) => ({
      atendimentoId: linha.atendimento_id,
      autorUsuarioId: linha.autor_usuario_id,
      conteudo: this.sanitizar(linha.conteudo),
      conversaId: linha.conversa_id,
      criadaEm: linha.criada_em.toISOString(),
      id: linha.id,
      visibilidade: 'SOMENTE_EQUIPE',
    }));
  }

  private calcularPermissoes(
    papelBase: PapelBaseAutorizacao,
    ajustes: readonly {
      readonly codigo: CodigoPermissaoAutorizacao;
      readonly efeito: 'CONCEDER' | 'NEGAR';
    }[],
  ): readonly string[] {
    const efetivas = new Set(MATRIZ_PERMISSOES_BASE[papelBase]);
    for (const ajuste of ajustes) {
      if (ajuste.efeito === 'NEGAR') efetivas.delete(ajuste.codigo);
      else efetivas.add(ajuste.codigo);
    }
    return [...efetivas].sort();
  }

  private estaNoPercentual(
    codigo: string,
    usuarioId: string,
    percentual: number,
  ): boolean {
    if (percentual <= 0) return false;
    if (percentual >= 100) return true;
    const faixa = createHash('sha256')
      .update(`${codigo}:${usuarioId}`, 'utf8')
      .digest()
      .readUInt32BE(0);
    return faixa < Math.floor((percentual / 100) * 2 ** 32);
  }

  private sanitizar(valor: unknown) {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      return {};
    }
    const resultado = this.sanitizador.sanitizar(
      Object.fromEntries(Object.entries(valor)),
    );
    return resultado ?? {};
  }
}
