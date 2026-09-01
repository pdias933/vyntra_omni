import { Inject, Injectable } from '@nestjs/common';

import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { Prisma } from '../gerado/prisma/client.js';
import { ServicoMensagensSaida } from '../mensagens/servico-mensagens-saida.js';
import { ServicoMidias } from '../midias/servico-midias.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ConteudoMidiaWeb, MensagemCriadaWeb, ModeloAprovadoWeb, RespostaRapidaWeb } from './modelo-console-web.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoComposerWeb {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoMensagensSaida) private readonly mensagens: ServicoMensagensSaida,
    @Inject(ServicoMidias) private readonly midias: ServicoMidias,
  ) {}

  public async listarRespostasRapidas(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    busca = '',
  ): Promise<readonly RespostaRapidaWeb[]> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      await this.autorizarComposicao(sessao, atendimentoId, transacao);
      const termo = this.normalizarBusca(busca);
      const respostas = await transacao.respostaRapida.findMany({
        orderBy: [{ atalho: 'asc' }, { id: 'asc' }],
        select: { atalho: true, id: true, textoProtegido: true, titulo: true },
        take: 20,
        where: {
          ativa: true,
          ...(termo.length === 0 ? {} : { OR: [
              { atalho: { contains: termo, mode: 'insensitive' } },
              { titulo: { contains: termo, mode: 'insensitive' } },
            ] }),
        },
      });
      return respostas.flatMap((resposta) => {
        const conteudo = this.objeto(resposta.textoProtegido);
        return typeof conteudo.texto === 'string' && conteudo.texto.trim().length > 0
          ? [{ atalho: resposta.atalho, id: resposta.id, texto: conteudo.texto.slice(0, 4_096), titulo: resposta.titulo }]
          : [];
      });
    });
  }

  public async listarModelos(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    busca = '',
  ): Promise<readonly ModeloAprovadoWeb[]> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const contexto = await this.autorizarComposicao(sessao, atendimentoId, transacao);
      const termo = this.normalizarBusca(busca);
      return transacao.modeloMensagemCanal.findMany({
        orderBy: [{ nome: 'asc' }, { idioma: 'asc' }, { id: 'asc' }],
        select: { id: true, idioma: true, nome: true, quantidadeParametros: true },
        take: 20,
        where: {
          contaWhatsAppId: contexto.contaWhatsAppId,
          estado: 'APROVADO',
          ...(termo.length === 0 ? {} : { nome: { contains: termo, mode: 'insensitive' } }),
        },
      });
    });
  }

  public async enviarTexto(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    entrada: { readonly mensagemClienteId: string; readonly respondeAMensagemId?: string; readonly texto: string },
    transacao: TransacaoPrisma,
  ): Promise<MensagemCriadaWeb> {
    const contexto = await this.obterContexto(atendimentoId, transacao);
    const mensagem = await this.mensagens.criarTexto(sessao, {
      atendimentoId,
      contaWhatsAppId: contexto.contaWhatsAppId,
      conversaId: contexto.conversaId,
      filaId: contexto.filaId,
      mensagemClienteId: entrada.mensagemClienteId,
      ...(entrada.respondeAMensagemId === undefined ? {} : { respondeAMensagemId: entrada.respondeAMensagemId }),
      texto: entrada.texto,
    }, transacao);
    return { estado: mensagem.estadoSaida, id: mensagem.id, recebidaServidorEm: mensagem.recebidaServidorEm };
  }

  public async enviarMidia(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    entrada: { readonly conteudo: Uint8Array; readonly mensagemClienteId: string; readonly mime: string; readonly nomeArquivo?: string },
    transacao: TransacaoPrisma,
  ): Promise<MensagemCriadaWeb> {
    const contexto = await this.obterContexto(atendimentoId, transacao);
    const mensagem = await this.mensagens.criarMidia(sessao, {
      atendimentoId,
      contaWhatsAppId: contexto.contaWhatsAppId,
      conteudo: entrada.conteudo,
      conversaId: contexto.conversaId,
      filaId: contexto.filaId,
      mensagemClienteId: entrada.mensagemClienteId,
      mime: entrada.mime,
      ...(entrada.nomeArquivo === undefined ? {} : { nomeArquivo: entrada.nomeArquivo }),
    }, transacao);
    return { estado: mensagem.estadoSaida, id: mensagem.id, recebidaServidorEm: mensagem.recebidaServidorEm };
  }

  public async reagir(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    entrada: { readonly emoji: string; readonly mensagemAlvoId: string; readonly mensagemClienteId: string },
    transacao: TransacaoPrisma,
  ): Promise<MensagemCriadaWeb> {
    const contexto = await this.obterContexto(atendimentoId, transacao);
    const mensagem = await this.mensagens.criarReacao(sessao, {
      atendimentoId,
      contaWhatsAppId: contexto.contaWhatsAppId,
      conversaId: contexto.conversaId,
      emoji: entrada.emoji,
      filaId: contexto.filaId,
      mensagemAlvoId: entrada.mensagemAlvoId,
      mensagemClienteId: entrada.mensagemClienteId,
    }, transacao);
    return { estado: mensagem.estadoSaida, id: mensagem.id, recebidaServidorEm: mensagem.recebidaServidorEm };
  }

  public async baixarMidia(sessao: ContextoSessaoAutorizacao, mensagemId: string): Promise<ConteudoMidiaWeb> {
    if (!UUID.test(mensagemId)) throw new ErroPermissaoNegada();
    const referencia = await this.prisma.executarLeituraConsistente(async (transacao) => {
      const mensagem = await transacao.mensagem.findUnique({
        select: {
          atendimento: { select: { filaAtualId: true } },
          conteudoProtegido: true,
          midia: { select: { chaveObjeto: true, conteudoHash: true, mimeDetectado: true, tamanhoBytes: true } },
        },
        where: { id: mensagemId },
      });
      if (mensagem?.atendimento.filaAtualId === null || mensagem === null || mensagem.midia === null) throw new ErroPermissaoNegada();
      await this.autorizacao.autorizar(
        { filaId: mensagem.atendimento.filaAtualId, permissao: 'VISUALIZAR_FILA', recurso: { id: mensagemId, tipo: 'MENSAGEM' }, sessao },
        async () => ({ acessivel: true, estadoPermiteAcao: true }),
        transacao,
      );
      const conteudo = this.objeto(mensagem.conteudoProtegido);
      const nomeArquivo = typeof conteudo.nomeArquivo === 'string' ? conteudo.nomeArquivo : `midia-${mensagemId}`;
      return {
        chaveObjeto: mensagem.midia.chaveObjeto,
        conteudoHash: mensagem.midia.conteudoHash,
        mime: mensagem.midia.mimeDetectado,
        nomeArquivo: nomeArquivo.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180),
        tamanhoBytes: Number(mensagem.midia.tamanhoBytes),
      };
    });
    return {
      bytes: await this.midias.obter(referencia),
      mime: referencia.mime,
      nomeArquivo: referencia.nomeArquivo,
    };
  }

  public async enviarModelo(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    entrada: { readonly mensagemClienteId: string; readonly modeloId: string; readonly parametros: readonly string[] },
    transacao: TransacaoPrisma,
  ): Promise<MensagemCriadaWeb> {
    const contexto = await this.obterContexto(atendimentoId, transacao);
    const mensagem = await this.mensagens.criarModeloAprovado(sessao, {
      atendimentoId,
      contaWhatsAppId: contexto.contaWhatsAppId,
      conversaId: contexto.conversaId,
      filaId: contexto.filaId,
      mensagemClienteId: entrada.mensagemClienteId,
      modeloId: entrada.modeloId,
      parametros: entrada.parametros,
    }, transacao);
    return { estado: mensagem.estadoSaida, id: mensagem.id, recebidaServidorEm: mensagem.recebidaServidorEm };
  }

  private async autorizarComposicao(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ) {
    const contexto = await this.obterContexto(atendimentoId, transacao);
    await this.autorizacao.autorizar(
      { filaId: contexto.filaId, permissao: 'ENVIAR_MENSAGEM', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
    return contexto;
  }

  private async obterContexto(atendimentoId: string, transacao: TransacaoPrisma) {
    if (!UUID.test(atendimentoId)) throw new ErroPermissaoNegada();
    const atendimento = await transacao.atendimento.findUnique({
      select: { contaWhatsAppOrigemId: true, conversaId: true, filaAtualId: true },
      where: { id: atendimentoId },
    });
    if (atendimento?.filaAtualId === null || atendimento === null) throw new ErroPermissaoNegada();
    return {
      contaWhatsAppId: atendimento.contaWhatsAppOrigemId,
      conversaId: atendimento.conversaId,
      filaId: atendimento.filaAtualId as string,
    };
  }

  private normalizarBusca(busca: string): string {
    if (typeof busca !== 'string' || busca.length > 80 || busca.includes('\u0000')) throw new Error('BUSCA_COMPOSER_INVALIDA');
    return busca.trim();
  }

  private objeto(valor: Prisma.JsonValue): Readonly<Record<string, unknown>> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor as Readonly<Record<string, unknown>> : {};
  }
}
