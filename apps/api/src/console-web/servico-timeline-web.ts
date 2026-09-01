import { Buffer } from 'node:buffer';

import { Inject, Injectable } from '@nestjs/common';

import type { CodigoPermissaoAutorizacao, ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ItemTimelineWeb, PaginaTimelineWeb } from './modelo-console-web.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LIMITE = 50;

interface CursorTimeline { readonly ocorridoEm: Date; readonly id: string }
interface DadosMarcador {
  readonly lidaAteEm?: Date;
  readonly marcadaNaoLida?: boolean;
  readonly ultimaMensagemLidaId?: string;
}

@Injectable()
export class ServicoTimelineWeb {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async obter(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    cursorRecebido?: string,
  ): Promise<PaginaTimelineWeb> {
    this.validarUuid(atendimentoId);
    const cursor = this.decodificarCursor(cursorRecebido);
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const contexto = await this.autorizarAtendimento(sessao, atendimentoId, transacao);
      const filasAutorizadas = await this.resolverFilasAutorizadas(sessao, 'VISUALIZAR_FILA', transacao);
      const filasNotasAutorizadas = await this.resolverFilasAutorizadas(sessao, 'VISUALIZAR_NOTA_INTERNA', transacao);
      const historicoTransversal = await this.temPermissaoTransversal(sessao, atendimentoId, 'VISUALIZAR_HISTORICO_TRANSVERSAL', transacao);
      const notasTransversais = await this.temPermissaoTransversal(sessao, atendimentoId, 'VISUALIZAR_NOTAS_TRANSVERSAIS', transacao);
      const atendimentos = await transacao.atendimento.findMany({
        orderBy: [{ iniciadoEm: 'asc' }, { id: 'asc' }],
        select: {
          contaWhatsAppOrigem: { select: { nomeExibicao: true } },
          encerradoEm: true,
          filaAtualId: true,
          id: true,
          iniciadoEm: true,
        },
        where: {
          conversaId: contexto.conversaId,
          ...(historicoTransversal ? {} : { OR: [
              { filaAtualId: { in: filasAutorizadas } },
              { historicosAtribuicao: { some: { filaId: { in: filasAutorizadas } } } },
            ] }),
        },
      });
      const idsAtendimentos = atendimentos.map(({ id }) => id);
      if (!idsAtendimentos.includes(atendimentoId)) throw new ErroPermissaoNegada();

      const condicaoCursor = cursor === undefined ? {} : {
        OR: [
          { recebidaServidorEm: { lt: cursor.ocorridoEm } },
          { id: { lt: cursor.id }, recebidaServidorEm: cursor.ocorridoEm },
        ],
      };
      const [mensagens, notas, eventos, marcador] = await Promise.all([
        transacao.mensagem.findMany({
          orderBy: [{ recebidaServidorEm: 'desc' }, { id: 'desc' }],
          select: {
            atendimentoId: true,
            contaWhatsApp: { select: { nomeExibicao: true } },
            conteudoProtegido: true,
            direcao: true,
            estadoSaida: true,
            id: true,
            recebidaServidorEm: true,
            submissaoFormulario: { select: { formulario: { select: { nome: true } } } },
            tipo: true,
          },
          take: LIMITE + 1,
          where: { atendimentoId: { in: idsAtendimentos }, conversaId: contexto.conversaId, ...condicaoCursor },
        }),
        transacao.notaInterna.findMany({
          orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
          select: { atendimentoId: true, conteudoProtegido: true, criadaEm: true, id: true },
          take: LIMITE + 1,
          where: {
            atendimentoId: { in: idsAtendimentos },
            conversaId: contexto.conversaId,
            ...(notasTransversais ? {} : { filaId: { in: filasNotasAutorizadas } }),
            ...(cursor === undefined ? {} : { OR: [{ criadaEm: { lt: cursor.ocorridoEm } }, { criadaEm: cursor.ocorridoEm, id: { lt: cursor.id } }] }),
          },
        }),
        transacao.eventoDominio.findMany({
          orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
          select: { atendimentoId: true, criadoEm: true, id: true, tipo: true },
          take: LIMITE + 1,
          where: {
            atendimentoId: { in: idsAtendimentos },
            conversaId: contexto.conversaId,
            tipo: { in: ['ATENDIMENTO_RESGATADO', 'ATENDIMENTO_TRANSFERIDO', 'ATENDIMENTO_ENCERRADO', 'PROTOCOLO_ERP_ABERTO'] },
            ...(cursor === undefined ? {} : { OR: [{ criadoEm: { lt: cursor.ocorridoEm } }, { criadoEm: cursor.ocorridoEm, id: { lt: cursor.id } }] }),
          },
        }),
        transacao.marcadorLeituraConversaUsuario.findUnique({
          select: { marcadaNaoLida: true, ultimaMensagemLidaId: true, versao: true },
          where: { usuarioId_conversaId: { conversaId: contexto.conversaId, usuarioId: sessao.usuarioId } },
        }),
      ]);

      const itens: ItemTimelineWeb[] = [];
      for (const atendimento of atendimentos) {
        if (cursor !== undefined && atendimento.iniciadoEm >= cursor.ocorridoEm) continue;
        itens.push({
          atendimentoId: atendimento.id,
          contaWhatsAppNome: atendimento.contaWhatsAppOrigem.nomeExibicao,
          id: `atendimento:${atendimento.id}`,
          ocorridoEm: atendimento.iniciadoEm,
          rotulo: atendimento.encerradoEm === null ? 'Atendimento atual' : 'Atendimento anterior',
          tipo: 'SEPARADOR_ATENDIMENTO',
        });
      }
      for (const mensagem of mensagens) {
        const conteudo = this.objeto(mensagem.conteudoProtegido);
        const formulario = mensagem.submissaoFormulario?.formulario.nome;
        itens.push({
          atendimentoId: mensagem.atendimentoId,
          contaWhatsAppNome: mensagem.contaWhatsApp.nomeExibicao,
          direcao: mensagem.direcao,
          ...(mensagem.estadoSaida === null ? {} : { estadoMensagem: mensagem.estadoSaida }),
          id: mensagem.id,
          mensagemTipo: mensagem.tipo,
          ocorridoEm: mensagem.recebidaServidorEm,
          ...(formulario === undefined ? {} : { rotulo: formulario }),
          ...(typeof conteudo.texto === 'string' ? { texto: conteudo.texto.slice(0, 8_000) } : {}),
          tipo: formulario === undefined ? 'MENSAGEM' : 'FORMULARIO',
        });
      }
      for (const nota of notas) {
        const conteudo = this.objeto(nota.conteudoProtegido);
        itens.push({
          atendimentoId: nota.atendimentoId,
          id: nota.id,
          ocorridoEm: nota.criadaEm,
          somenteEquipe: true,
          texto: typeof conteudo.texto === 'string' ? conteudo.texto.slice(0, 4_000) : 'Nota interna',
          tipo: 'NOTA_INTERNA',
        });
      }
      for (const evento of eventos) {
        if (evento.atendimentoId === null) continue;
        itens.push({
          atendimentoId: evento.atendimentoId,
          id: evento.id,
          ocorridoEm: evento.criadoEm,
          rotulo: this.rotuloEvento(evento.tipo),
          somenteEquipe: true,
          tipo: 'EVENTO_OPERACIONAL',
        });
      }
      itens.sort((a, b) => b.ocorridoEm.getTime() - a.ocorridoEm.getTime() || b.id.localeCompare(a.id));
      const pagina = itens.slice(0, LIMITE);
      const ultimo = pagina.at(-1);
      return {
        itens: pagina.reverse(),
        marcador: {
          ...(marcador?.ultimaMensagemLidaId === null || marcador?.ultimaMensagemLidaId === undefined ? {} : { ultimaMensagemLidaId: marcador.ultimaMensagemLidaId }),
          marcadaNaoLida: marcador?.marcadaNaoLida ?? false,
          versao: marcador?.versao ?? 0,
        },
        ...(itens.length <= LIMITE || ultimo === undefined ? {} : { proximoCursor: this.codificarCursor(ultimo) }),
      };
    });
  }

  public async marcarLida(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    mensagemId: string,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    this.validarUuid(mensagemId);
    const contexto = await this.autorizarAtendimento(sessao, atendimentoId, transacao);
    const mensagem = await transacao.mensagem.findFirst({
      select: { id: true, recebidaServidorEm: true },
      where: { conversaId: contexto.conversaId, id: mensagemId },
    });
    if (mensagem === null) throw new ErroPermissaoNegada();
    return this.gravarMarcador(transacao, sessao.usuarioId, contexto.conversaId, versaoEsperada, {
      lidaAteEm: mensagem.recebidaServidorEm,
      marcadaNaoLida: false,
      ultimaMensagemLidaId: mensagem.id,
    });
  }

  public async marcarNaoLida(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    const contexto = await this.autorizarAtendimento(sessao, atendimentoId, transacao);
    return this.gravarMarcador(transacao, sessao.usuarioId, contexto.conversaId, versaoEsperada, { marcadaNaoLida: true });
  }

  private async autorizarAtendimento(sessao: ContextoSessaoAutorizacao, atendimentoId: string, transacao: TransacaoPrisma) {
    this.validarUuid(atendimentoId);
    const atendimento = await transacao.atendimento.findUnique({
      select: { conversaId: true, filaAtualId: true },
      where: { id: atendimentoId },
    });
    if (atendimento?.filaAtualId === null || atendimento === null) throw new ErroPermissaoNegada();
    await this.autorizacao.autorizar(
      { filaId: atendimento.filaAtualId, permissao: 'VISUALIZAR_FILA', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
    return atendimento as { readonly conversaId: string; readonly filaAtualId: string };
  }

  private async resolverFilasAutorizadas(
    sessao: ContextoSessaoAutorizacao,
    permissao: 'VISUALIZAR_FILA' | 'VISUALIZAR_NOTA_INTERNA',
    transacao: TransacaoPrisma,
  ): Promise<string[]> {
    const filas = await transacao.fila.findMany({ select: { id: true }, where: { estado: 'ATIVA' } });
    const autorizadas: string[] = [];
    for (const fila of filas) {
      try {
        await this.autorizacao.autorizar(
          { filaId: fila.id, permissao, recurso: { id: fila.id, tipo: 'FILA' }, sessao },
          async () => ({ acessivel: true, estadoPermiteAcao: true }),
          transacao,
        );
        autorizadas.push(fila.id);
      } catch (erro) {
        if (!(erro instanceof ErroPermissaoNegada)) throw erro;
      }
    }
    return autorizadas;
  }

  private async temPermissaoTransversal(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    permissao: Extract<CodigoPermissaoAutorizacao, 'VISUALIZAR_HISTORICO_TRANSVERSAL' | 'VISUALIZAR_NOTAS_TRANSVERSAIS'>,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    try {
      await this.autorizacao.autorizar(
        { permissao, recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao },
        async () => ({ acessivel: true, estadoPermiteAcao: true }),
        transacao,
      );
      return true;
    } catch (erro) {
      if (erro instanceof ErroPermissaoNegada) return false;
      throw erro;
    }
  }

  private async gravarMarcador(
    transacao: TransacaoPrisma,
    usuarioId: string,
    conversaId: string,
    versaoEsperada: number,
    dados: DadosMarcador,
  ): Promise<number> {
    if (!Number.isInteger(versaoEsperada) || versaoEsperada < 0) throw new Error('VERSAO_MARCADOR_INVALIDA');
    if (versaoEsperada === 0) {
      const criado = await transacao.marcadorLeituraConversaUsuario.create({
        data: { atualizadaEm: new Date(), conversaId, usuarioId, versao: 1, ...dados }, select: { versao: true },
      }).catch(() => { throw new Error('CONFLITO_VERSAO_MARCADOR'); });
      return criado.versao;
    }
    const atualizado = await transacao.marcadorLeituraConversaUsuario.updateMany({
      data: { atualizadaEm: new Date(), versao: { increment: 1 }, ...dados },
      where: { conversaId, usuarioId, versao: versaoEsperada },
    });
    if (atualizado.count !== 1) throw new Error('CONFLITO_VERSAO_MARCADOR');
    return versaoEsperada + 1;
  }

  private objeto(valor: Prisma.JsonValue): Readonly<Record<string, unknown>> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor as Readonly<Record<string, unknown>> : {};
  }

  private codificarCursor(item: ItemTimelineWeb): string {
    return Buffer.from(JSON.stringify({ data: item.ocorridoEm.toISOString(), id: item.id }), 'utf8').toString('base64url');
  }

  private decodificarCursor(cursor?: string): CursorTimeline | undefined {
    if (cursor === undefined) return undefined;
    try {
      if (cursor.length > 256) throw new Error();
      const bruto: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const data = typeof bruto === 'object' && bruto !== null ? Reflect.get(bruto, 'data') : undefined;
      const id = typeof bruto === 'object' && bruto !== null ? Reflect.get(bruto, 'id') : undefined;
      const ocorridoEm = new Date(typeof data === 'string' ? data : '');
      if (typeof id !== 'string' || id.length > 128 || Number.isNaN(ocorridoEm.getTime())) throw new Error();
      return { id, ocorridoEm };
    } catch {
      throw new Error('CURSOR_TIMELINE_INVALIDO');
    }
  }

  private validarUuid(id: string): void {
    if (!UUID.test(id)) throw new Error('IDENTIFICADOR_TIMELINE_INVALIDO');
  }

  private rotuloEvento(tipo: string): string {
    return ({
      ATENDIMENTO_ENCERRADO: 'Atendimento encerrado',
      ATENDIMENTO_RESGATADO: 'Atendimento resgatado',
      ATENDIMENTO_TRANSFERIDO: 'Atendimento transferido',
      PROTOCOLO_ERP_ABERTO: 'Protocolo do ERP aberto',
    } as Readonly<Record<string, string>>)[tipo] ?? 'Evento operacional';
  }
}
