import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type {
  FiltroAtendimentosWeb,
  ResumoAtendimentoWeb,
} from './modelo-console-web.js';

interface LinhaAtendimentoWeb {
  readonly atendimento_id: string;
  readonly conversa_id: string;
  readonly contato_id: string;
  readonly conta_whatsapp_id: string;
  readonly nome_contato: string | null;
  readonly telefone_e164: string | null;
  readonly nome_usuario: string | null;
  readonly fila_id: string;
  readonly fila_nome: string;
  readonly modo: 'BOT' | 'HUMANO';
  readonly estado: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  readonly ultima_atividade_em: Date;
  readonly ultima_mensagem_texto: string | null;
  readonly ultima_mensagem_tipo: string | null;
  readonly ultima_mensagem_direcao: 'ENTRADA' | 'SAIDA' | null;
  readonly quantidade_nao_lida: bigint;
  readonly sla_em: Date | null;
  readonly janela_expira_em: Date | null;
}

@Injectable()
export class ServicoListaAtendimentosWeb {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async listar(
    sessao: ContextoSessaoAutorizacao,
    filtro: FiltroAtendimentosWeb,
  ): Promise<readonly ResumoAtendimentoWeb[]> {
    const cliente = await this.prisma.obterCliente();
    const filas = await cliente.fila.findMany({
      select: { id: true },
      where: { estado: 'ATIVA' },
    });
    const filasAutorizadas: string[] = [];
    for (const fila of filas) {
      try {
        await this.autorizacao.autorizar(
          {
            filaId: fila.id,
            permissao: 'VISUALIZAR_FILA',
            recurso: { id: fila.id, tipo: 'FILA' },
            sessao,
          },
          async () => ({ acessivel: true, estadoPermiteAcao: true }),
        );
        filasAutorizadas.push(fila.id);
      } catch (erro) {
        if (!(erro instanceof ErroPermissaoNegada)) throw erro;
      }
    }
    if (filasAutorizadas.length === 0) return [];

    const condicao = this.condicaoFiltro(filtro, sessao.usuarioId);
    const idsFilas = Prisma.join(
      filasAutorizadas.map((filaId) => Prisma.sql`${filaId}::uuid`),
    );
    const linhas = await cliente.$queryRaw<LinhaAtendimentoWeb[]>(Prisma.sql`
      SELECT
        a."id" AS atendimento_id,
        a."conversa_id" AS conversa_id,
        c."contato_id" AS contato_id,
        a."conta_whatsapp_origem_id" AS conta_whatsapp_id,
        contato."nome_exibicao" AS nome_contato,
        identidade."telefone_e164",
        identidade."nome_usuario",
        f."id" AS fila_id,
        f."nome" AS fila_nome,
        a."modo"::text AS modo,
        a."estado"::text AS estado,
        c."ultima_atividade_em",
        ultima."texto" AS ultima_mensagem_texto,
        ultima."tipo" AS ultima_mensagem_tipo,
        ultima."direcao" AS ultima_mensagem_direcao,
        (
          SELECT COUNT(*)
          FROM "mensagem" nao_lida
          WHERE nao_lida."conversa_id" = c."id"
            AND nao_lida."direcao" = 'ENTRADA'
            AND nao_lida."recebida_servidor_em" > COALESCE(marcador."lida_ate_em", '-infinity'::timestamptz)
        ) AS quantidade_nao_lida,
        sla."alerta_atendente_em" AS sla_em,
        janela."expira_em" AS janela_expira_em
      FROM "atendimento" a
      INNER JOIN "conversa" c ON c."id" = a."conversa_id"
      INNER JOIN "contato" contato ON contato."id" = c."contato_id"
      INNER JOIN "fila" f ON f."id" = a."fila_atual_id"
      LEFT JOIN "marcador_leitura_conversa_usuario" marcador
        ON marcador."conversa_id" = c."id" AND marcador."usuario_id" = ${sessao.usuarioId}::uuid
      LEFT JOIN LATERAL (
        SELECT
          mensagem."conteudo_protegido"->>'texto' AS texto,
          mensagem."tipo"::text AS tipo,
          mensagem."direcao"::text AS direcao
        FROM "mensagem" mensagem
        WHERE mensagem."conversa_id" = c."id"
        ORDER BY mensagem."recebida_servidor_em" DESC, mensagem."id" DESC
        LIMIT 1
      ) ultima ON true
      LEFT JOIN LATERAL (
        SELECT relogio."alerta_atendente_em"
        FROM "relogio_sla_atendimento" relogio
        WHERE relogio."atendimento_id" = a."id" AND relogio."finalizado_em" IS NULL
        ORDER BY relogio."numero_ciclo" DESC
        LIMIT 1
      ) sla ON true
      LEFT JOIN "janela_atendimento_canal" janela
        ON janela."contato_id" = c."contato_id"
        AND janela."conta_whatsapp_id" = a."conta_whatsapp_origem_id"
      LEFT JOIN LATERAL (
        SELECT iw."telefone_e164", iw."nome_usuario"
        FROM "identidade_whatsapp" iw
        WHERE iw."contato_id" = c."contato_id"
        ORDER BY iw."atualizada_em" DESC, iw."id" DESC
        LIMIT 1
      ) identidade ON true
      WHERE a."fila_atual_id" IN (${idsFilas})
        AND a."estado" IN ('AGUARDANDO', 'EM_ATENDIMENTO')
        AND contato."estado" = 'NORMAL'
        AND ${condicao}
      ORDER BY c."ultima_atividade_em" DESC, a."id" DESC
      LIMIT 60
    `);
    return linhas.map((linha) => this.mapear(linha));
  }

  private condicaoFiltro(filtro: FiltroAtendimentosWeb, usuarioId: string): Prisma.Sql {
    switch (filtro) {
      case 'MEUS':
        return Prisma.sql`a."usuario_responsavel_id" = ${usuarioId}::uuid`;
      case 'PENDENTES':
        return Prisma.sql`a."estado" = 'AGUARDANDO' AND a."usuario_responsavel_id" IS NULL`;
      case 'NAO_LIDOS':
        return Prisma.sql`(
          marcador."marcada_nao_lida" = true OR EXISTS (
            SELECT 1 FROM "mensagem" nova
            WHERE nova."conversa_id" = c."id"
              AND nova."direcao" = 'ENTRADA'
              AND nova."recebida_servidor_em" > COALESCE(marcador."lida_ate_em", '-infinity'::timestamptz)
          )
        )`;
      case 'SLA':
        return Prisma.sql`sla."alerta_atendente_em" <= NOW() + INTERVAL '15 minutes'`;
      case 'EXPIRANDO':
        return Prisma.sql`janela."expira_em" > NOW() AND janela."expira_em" <= NOW() + INTERVAL '30 minutes'`;
      case 'EM_AUTOMACAO':
        return Prisma.sql`a."modo" = 'BOT' AND EXISTS (
          SELECT 1 FROM "execucao_fluxo" execucao
          WHERE execucao."atendimento_id" = a."id"
            AND execucao."estado" IN ('EXECUTANDO', 'AGUARDANDO_RESPOSTA', 'AGUARDANDO_SISTEMA', 'AGUARDANDO_ATENDENTE')
        )`;
    }
  }

  private mapear(linha: LinhaAtendimentoWeb): ResumoAtendimentoWeb {
    const resumo = linha.ultima_mensagem_texto?.trim();
    const telefone = linha.telefone_e164;
    return {
      atendimentoId: linha.atendimento_id,
      conversaId: linha.conversa_id,
      contatoId: linha.contato_id,
      contaWhatsAppId: linha.conta_whatsapp_id,
      estado: linha.estado,
      filaId: linha.fila_id,
      filaNome: linha.fila_nome,
      ...(telefone === null && linha.nome_usuario === null
        ? {}
        : { identidadeSecundaria: linha.nome_usuario ?? this.mascararTelefone(telefone as string) }),
      ...(linha.janela_expira_em === null ? {} : { janelaExpiraEm: linha.janela_expira_em }),
      modo: linha.modo,
      nomeContato: linha.nome_contato?.trim() || 'Contato sem nome',
      quantidadeNaoLida: Number(linha.quantidade_nao_lida),
      ...(linha.sla_em === null ? {} : { slaEm: linha.sla_em }),
      ultimaAtividadeEm: linha.ultima_atividade_em,
      ...(linha.ultima_mensagem_direcao === null ? {} : { ultimaMensagemDirecao: linha.ultima_mensagem_direcao }),
      ultimaMensagemResumo:
        resumo === undefined || resumo.length === 0
          ? this.rotuloTipo(linha.ultima_mensagem_tipo)
          : resumo.slice(0, 160),
    };
  }

  private mascararTelefone(telefone: string): string {
    return telefone.replace(/^(\+\d{2})(\d+)(\d{4})$/u, (_valor, pais: string, meio: string, fim: string) =>
      `${pais} ${'*'.repeat(Math.min(meio.length, 6))}-${fim}`,
    );
  }

  private rotuloTipo(tipo: string | null): string {
    const rotulos: Readonly<Record<string, string>> = {
      AUDIO: 'Áudio',
      DOCUMENTO: 'Documento',
      FORMULARIO: 'Formulário recebido',
      IMAGEM: 'Imagem',
      REACAO: 'Reação',
      VIDEO: 'Vídeo',
    };
    return tipo === null ? 'Atendimento iniciado' : (rotulos[tipo] ?? 'Nova mensagem');
  }
}
