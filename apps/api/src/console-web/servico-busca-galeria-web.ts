import { Buffer } from 'node:buffer';

import { Inject, Injectable } from '@nestjs/common';

import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { CodigoPermissaoAutorizacao, ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ItemGaleriaConversaWeb, PaginaBuscaConversaWeb, PaginaGaleriaConversaWeb, ResultadoBuscaConversaWeb, TipoGaleriaWeb } from './modelo-console-web.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LIMITE = 30;

interface CursorBusca { readonly id: string; readonly ocorridoEm: Date }
interface LinhaBusca {
  readonly atendimento_id: string;
  readonly conta_nome: string;
  readonly direcao: 'ENTRADA' | 'SAIDA';
  readonly id: string;
  readonly ocorrido_em: Date;
  readonly texto: string | null;
  readonly tipo: string;
}
interface LinhaGaleria extends LinhaBusca { readonly mime: string | null; readonly tamanho_bytes: bigint | null }

@Injectable()
export class ServicoBuscaGaleriaWeb {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async buscar(sessao: ContextoSessaoAutorizacao, atendimentoId: string, termoRecebido: string, cursorRecebido?: string): Promise<PaginaBuscaConversaWeb> {
    const termo = termoRecebido.trim().replace(/\s+/gu, ' ');
    if (termo.length < 2 || termo.length > 120) throw new Error('TERMO_BUSCA_INVALIDO');
    const cursor = this.decodificarCursor(cursorRecebido);
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const escopo = await this.resolverEscopo(sessao, atendimentoId, transacao);
      const linhas = await transacao.$queryRaw<LinhaBusca[]>(Prisma.sql`
        SELECT m."id", m."atendimento_id", m."direcao"::text AS "direcao", m."tipo"::text AS "tipo",
          m."recebida_servidor_em" AS "ocorrido_em", left(m."conteudo_protegido" ->> 'texto', 240) AS "texto",
          c."nome_exibicao" AS "conta_nome"
        FROM "mensagem" m
        JOIN "conta_whatsapp" c ON c."id" = m."conta_whatsapp_id"
        WHERE m."conversa_id" = ${escopo.conversaId}::uuid
          AND m."atendimento_id" IN (${Prisma.join(escopo.atendimentoIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND m."tipo" <> 'REACAO'::"tipo_mensagem"
          AND to_tsvector('portuguese', coalesce(m."conteudo_protegido" ->> 'texto', '')) @@ websearch_to_tsquery('portuguese', ${termo})
          ${cursor === undefined ? Prisma.empty : Prisma.sql`AND (m."recebida_servidor_em", m."id") < (${cursor.ocorridoEm}, ${cursor.id}::uuid)`}
        ORDER BY m."recebida_servidor_em" DESC, m."id" DESC
        LIMIT ${LIMITE + 1}
      `);
      const itens = linhas.slice(0, LIMITE).map((linha): ResultadoBuscaConversaWeb => ({
        atendimentoId: linha.atendimento_id,
        contaWhatsAppNome: linha.conta_nome,
        direcao: linha.direcao,
        id: linha.id,
        ocorridoEm: linha.ocorrido_em,
        trecho: linha.texto ?? linha.tipo.toLocaleLowerCase('pt-BR'),
        tipoMensagem: linha.tipo,
      }));
      const ultimo = itens.at(-1);
      return { itens, ...(linhas.length <= LIMITE || ultimo === undefined ? {} : { proximoCursor: this.codificarCursor(ultimo) }) };
    });
  }

  public async listarGaleria(sessao: ContextoSessaoAutorizacao, atendimentoId: string, tipo: TipoGaleriaWeb, cursorRecebido?: string): Promise<PaginaGaleriaConversaWeb> {
    if (!['DOCUMENTOS', 'LINKS', 'MIDIAS'].includes(tipo)) throw new Error('TIPO_GALERIA_INVALIDO');
    const cursor = this.decodificarCursor(cursorRecebido);
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const escopo = await this.resolverEscopo(sessao, atendimentoId, transacao);
      const filtro = tipo === 'MIDIAS'
        ? Prisma.sql`m."tipo" IN ('IMAGEM'::"tipo_mensagem", 'AUDIO'::"tipo_mensagem", 'VIDEO'::"tipo_mensagem")`
        : tipo === 'DOCUMENTOS'
          ? Prisma.sql`m."tipo" = 'PDF'::"tipo_mensagem"`
          : Prisma.sql`m."tipo" = 'TEXTO'::"tipo_mensagem" AND (m."conteudo_protegido" ->> 'texto') ~* 'https://[^[:space:]]+'`;
      const linhas = await transacao.$queryRaw<LinhaGaleria[]>(Prisma.sql`
        SELECT m."id", m."atendimento_id", m."direcao"::text AS "direcao", m."tipo"::text AS "tipo",
          m."recebida_servidor_em" AS "ocorrido_em", left(m."conteudo_protegido" ->> 'texto', 500) AS "texto",
          c."nome_exibicao" AS "conta_nome", md."mime_detectado" AS "mime", md."tamanho_bytes"
        FROM "mensagem" m
        JOIN "conta_whatsapp" c ON c."id" = m."conta_whatsapp_id"
        LEFT JOIN "midia_mensagem" md ON md."mensagem_id" = m."id"
        WHERE m."conversa_id" = ${escopo.conversaId}::uuid
          AND m."atendimento_id" IN (${Prisma.join(escopo.atendimentoIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND ${filtro}
          ${cursor === undefined ? Prisma.empty : Prisma.sql`AND (m."recebida_servidor_em", m."id") < (${cursor.ocorridoEm}, ${cursor.id}::uuid)`}
        ORDER BY m."recebida_servidor_em" DESC, m."id" DESC
        LIMIT ${LIMITE + 1}
      `);
      const itens = linhas.slice(0, LIMITE).map((linha): ItemGaleriaConversaWeb => ({
        atendimentoId: linha.atendimento_id,
        id: linha.id,
        ocorridoEm: linha.ocorrido_em,
        tipo,
        tipoMensagem: linha.tipo,
        ...(linha.mime === null ? {} : { mime: linha.mime }),
        ...(linha.tamanho_bytes === null ? {} : { tamanhoBytes: Number(linha.tamanho_bytes) }),
        ...(linha.texto === null ? {} : { trecho: linha.texto }),
      }));
      const ultimo = itens.at(-1);
      return { itens, ...(linhas.length <= LIMITE || ultimo === undefined ? {} : { proximoCursor: this.codificarCursor(ultimo) }) };
    });
  }

  private async resolverEscopo(sessao: ContextoSessaoAutorizacao, atendimentoId: string, transacao: TransacaoPrisma): Promise<{ readonly atendimentoIds: readonly string[]; readonly conversaId: string }> {
    if (!UUID.test(atendimentoId)) throw new ErroPermissaoNegada();
    const atual = await transacao.atendimento.findUnique({ select: { conversaId: true, filaAtualId: true }, where: { id: atendimentoId } });
    if (atual?.filaAtualId === null || atual === null) throw new ErroPermissaoNegada();
    await this.autorizacao.autorizar(
      { filaId: atual.filaAtualId, permissao: 'VISUALIZAR_FILA', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao },
      async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao,
    );
    const filas = await transacao.fila.findMany({ select: { id: true }, where: { estado: 'ATIVA' } });
    const filasAutorizadas: string[] = [];
    for (const fila of filas) {
      try {
        await this.autorizacao.autorizar(
          { filaId: fila.id, permissao: 'VISUALIZAR_FILA', recurso: { id: fila.id, tipo: 'FILA' }, sessao },
          async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao,
        );
        filasAutorizadas.push(fila.id);
      } catch (erro) { if (!(erro instanceof ErroPermissaoNegada)) throw erro; }
    }
    const transversal = await this.temPermissao(sessao, atendimentoId, 'VISUALIZAR_HISTORICO_TRANSVERSAL', transacao);
    const atendimentos = await transacao.atendimento.findMany({
      select: { id: true },
      where: { conversaId: atual.conversaId, ...(transversal ? {} : { OR: [{ filaAtualId: { in: filasAutorizadas } }, { historicosAtribuicao: { some: { filaId: { in: filasAutorizadas } } } }] }) },
    });
    const atendimentoIds = atendimentos.map(({ id }) => id);
    if (!atendimentoIds.includes(atendimentoId) || atendimentoIds.length === 0) throw new ErroPermissaoNegada();
    return { atendimentoIds, conversaId: atual.conversaId };
  }

  private async temPermissao(sessao: ContextoSessaoAutorizacao, atendimentoId: string, permissao: Extract<CodigoPermissaoAutorizacao, 'VISUALIZAR_HISTORICO_TRANSVERSAL'>, transacao: TransacaoPrisma): Promise<boolean> {
    try {
      await this.autorizacao.autorizar({ permissao, recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
      return true;
    } catch (erro) { if (erro instanceof ErroPermissaoNegada) return false; throw erro; }
  }

  private codificarCursor(item: { readonly id: string; readonly ocorridoEm: Date }): string {
    return Buffer.from(JSON.stringify({ data: item.ocorridoEm.toISOString(), id: item.id }), 'utf8').toString('base64url');
  }

  private decodificarCursor(cursor?: string): CursorBusca | undefined {
    if (cursor === undefined) return undefined;
    try {
      if (cursor.length > 256) throw new Error();
      const bruto: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const data = typeof bruto === 'object' && bruto !== null ? Reflect.get(bruto, 'data') : undefined;
      const id = typeof bruto === 'object' && bruto !== null ? Reflect.get(bruto, 'id') : undefined;
      const ocorridoEm = new Date(typeof data === 'string' ? data : '');
      if (typeof id !== 'string' || !UUID.test(id) || Number.isNaN(ocorridoEm.getTime())) throw new Error();
      return { id, ocorridoEm };
    } catch { throw new Error('CURSOR_BUSCA_INVALIDO'); }
  }
}
