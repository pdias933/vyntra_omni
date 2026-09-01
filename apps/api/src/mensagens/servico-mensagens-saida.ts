import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoCaixaSaida } from '../eventos/servico-caixa-saida.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import { ErroTextoLivreForaJanela } from '../janela-canal/erros-janela-canal.js';
import { ServicoJanelaCanal } from '../janela-canal/servico-janela-canal.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroIdempotenciaMensagemDivergente,
  ErroMensagemInvalida,
} from './erros-mensagem.js';
import type {
  MensagemSaidaPersistida,
  OpcaoMensagemAutomatica,
  ResultadoCriacaoMensagemAutomatica,
} from './modelo-mensagem.js';
import {
  REPOSITORIO_MENSAGENS,
  type RepositorioMensagens,
} from './repositorio-mensagens.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoMensagensSaida {
  public constructor(
    @Inject(REPOSITORIO_MENSAGENS)
    private readonly repositorio: RepositorioMensagens,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoJanelaCanal)
    private readonly janela: ServicoJanelaCanal,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoCaixaSaida)
    private readonly caixaSaida: ServicoCaixaSaida,
  ) {}

  public async criarTexto(
    sessao: ContextoSessaoAutorizacao,
    entrada: {
      readonly atendimentoId: string;
      readonly contaWhatsAppId: string;
      readonly conversaId: string;
      readonly criadaDispositivoEm?: Date;
      readonly filaId: string;
      readonly mensagemClienteId: string;
      readonly texto: string;
    },
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<MensagemSaidaPersistida> {
    const texto = this.validarEntrada(entrada);
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroMensagemInvalida();
    const conteudoHash = createHash('sha256').update(texto, 'utf8').digest('hex');
    await this.repositorio.bloquearIdempotencia(
      sessao.usuarioId,
      entrada.mensagemClienteId,
      transacao,
    );
    const existente = await this.repositorio.obterPorIdempotencia(
      sessao.usuarioId,
      entrada.mensagemClienteId,
      transacao,
    );
    if (existente !== undefined) {
      if (
        existente.conversaId !== entrada.conversaId ||
        existente.atendimentoId !== entrada.atendimentoId ||
        existente.contaWhatsAppId !== entrada.contaWhatsAppId ||
        existente.conteudoHash !== conteudoHash
      ) {
        throw new ErroIdempotenciaMensagemDivergente();
      }
      return existente;
    }
    let contexto:
      | Awaited<ReturnType<RepositorioMensagens['obterContextoSaida']>>
      | undefined;
    await this.autorizacao.autorizar(
      {
        filaId: entrada.filaId,
        permissao: 'ENVIAR_MENSAGEM',
        recurso: { id: entrada.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => {
        contexto = await this.repositorio.obterContextoSaida(
          entrada.conversaId,
          entrada.atendimentoId,
          entrada.contaWhatsAppId,
          entrada.filaId,
          sessao.usuarioId,
          transacao,
        );
        return {
          acessivel: contexto !== undefined,
          estadoPermiteAcao: contexto?.permiteEnvio === true,
        };
      },
      transacao,
    );
    if (contexto === undefined) throw new ErroMensagemInvalida();
    await this.janela.autorizarSaida(
      contexto.contatoId,
      contexto.contaWhatsAppId,
      'TEXTO_LIVRE',
      transacao,
      relogio,
    );
    const mensagem: MensagemSaidaPersistida = {
      atendimentoId: entrada.atendimentoId,
      canceladaEm: undefined,
      codigoFalha: undefined,
      contatoRemetenteId: undefined,
      contaWhatsAppId: entrada.contaWhatsAppId,
      conteudoHash,
      conteudoProtegido: { texto },
      conversaId: entrada.conversaId,
      criadaDispositivoEm: entrada.criadaDispositivoEm,
      direcao: 'SAIDA',
      entregueEm: undefined,
      enviadaEm: undefined,
      estadoSaida: 'NA_FILA',
      falhouEm: undefined,
      id: randomUUID(),
      identificadorExternoMensagem: undefined,
      lidaEm: undefined,
      mensagemClienteId: entrada.mensagemClienteId,
      proximaTentativaEm: agora,
      recebidaServidorEm: agora,
      tentativasEnvio: 0,
      tipo: 'TEXTO',
      usuarioRemetenteId: sessao.usuarioId,
      versao: 1,
    };
    await this.repositorio.acrescentar(mensagem, transacao);
    const evento = await this.eventos.acrescentar(
      {
        atendimentoId: mensagem.atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: mensagem.conversaId,
        dados: { estado: 'NA_FILA', tipo: 'TEXTO' },
        entidadeId: mensagem.id,
        entidadeTipo: 'MENSAGEM',
        tipo: 'MENSAGEM_SAIDA_CRIADA',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.caixaSaida.acrescentar(
      {
        dados: { mensagemId: mensagem.id },
        destino: 'MENSAGERIA',
        tipo: 'ENVIAR_MENSAGEM',
      },
      evento,
      transacao,
    );
    return mensagem;
  }

  public async criarAutomatica(
    entrada:
      | {
          readonly atendimentoId: unknown;
          readonly execucaoFluxoId: unknown;
          readonly revisaoExecucao: unknown;
          readonly texto: unknown;
          readonly tipo: 'TEXTO';
        }
      | {
          readonly atendimentoId: unknown;
          readonly execucaoFluxoId: unknown;
          readonly revisaoExecucao: unknown;
          readonly texto: unknown;
          readonly opcoes: unknown;
          readonly tipo: 'LISTA';
        },
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoCriacaoMensagemAutomatica> {
    const identificadores = [entrada.atendimentoId, entrada.execucaoFluxoId];
    if (
      !identificadores.every(
        (id) => typeof id === 'string' && UUID.test(id),
      ) ||
      typeof entrada.revisaoExecucao !== 'number' ||
      !Number.isInteger(entrada.revisaoExecucao) ||
      entrada.revisaoExecucao < 1
    ) {
      return {
        codigo: 'CONFIGURACAO_MENSAGEM_INVALIDA',
        resultado: 'FALHA_DEFINITIVA',
      };
    }
    const texto = this.validarTextoAutomatico(entrada.texto);
    const opcoes =
      entrada.tipo === 'LISTA' ? this.validarOpcoes(entrada.opcoes) : undefined;
    if (texto === undefined || (entrada.tipo === 'LISTA' && opcoes === undefined)) {
      return {
        codigo: 'CONFIGURACAO_MENSAGEM_INVALIDA',
        resultado: 'FALHA_DEFINITIVA',
      };
    }
    await this.repositorio.bloquearAutoridadeSaida(
      entrada.atendimentoId as string,
      transacao,
    );
    const contexto = await this.repositorio.obterContextoSaidaAutomatica(
      entrada.execucaoFluxoId as string,
      entrada.atendimentoId as string,
      entrada.revisaoExecucao,
      transacao,
    );
    if (contexto === undefined) {
      return {
        codigo: 'AUTORIDADE_AUTOMACAO_PERDIDA',
        resultado: 'FALHA_DEFINITIVA',
      };
    }
    const textoSaida =
      entrada.tipo === 'TEXTO'
        ? texto
        : this.comporFallbackLista(texto, opcoes as readonly OpcaoMensagemAutomatica[]);
    if (textoSaida.length > 4_096) {
      return {
        codigo: 'FALLBACK_LISTA_EXCEDE_LIMITE',
        resultado: 'FALHA_DEFINITIVA',
      };
    }
    try {
      await this.janela.autorizarSaida(
        contexto.contatoId,
        contexto.contaWhatsAppId,
        'TEXTO_LIVRE',
        transacao,
        relogio,
      );
    } catch (erro) {
      if (erro instanceof ErroTextoLivreForaJanela) {
        return {
          codigo: 'JANELA_CANAL_FECHADA',
          resultado: 'FALHA_DEFINITIVA',
        };
      }
      throw erro;
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) {
      return {
        codigo: 'RELOGIO_MENSAGEM_INVALIDO',
        resultado: 'FALHA_TEMPORARIA',
      };
    }
    const conteudoHash = createHash('sha256')
      .update(textoSaida, 'utf8')
      .digest('hex');
    const mensagem: MensagemSaidaPersistida = {
      atendimentoId: entrada.atendimentoId as string,
      canceladaEm: undefined,
      codigoFalha: undefined,
      contatoRemetenteId: undefined,
      contaWhatsAppId: contexto.contaWhatsAppId,
      conteudoHash,
      conteudoProtegido: { texto: textoSaida },
      conversaId: contexto.conversaId,
      criadaDispositivoEm: undefined,
      direcao: 'SAIDA',
      entregueEm: undefined,
      enviadaEm: undefined,
      estadoSaida: 'NA_FILA',
      falhouEm: undefined,
      id: randomUUID(),
      identificadorExternoMensagem: undefined,
      lidaEm: undefined,
      mensagemClienteId: undefined,
      proximaTentativaEm: agora,
      recebidaServidorEm: agora,
      tentativasEnvio: 0,
      tipo: 'TEXTO',
      usuarioRemetenteId: undefined,
      versao: 1,
      execucaoFluxoOrigemId: entrada.execucaoFluxoId as string,
      versaoAtribuicaoOrigem: contexto.versaoAtribuicao,
    };
    await this.repositorio.acrescentar(mensagem, transacao);
    const evento = await this.eventos.acrescentar(
      {
        atendimentoId: mensagem.atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: mensagem.conversaId,
        dados: {
          estado: 'NA_FILA',
          origem: 'FLUXO',
          tipo: mensagem.tipo,
        },
        entidadeId: mensagem.id,
        entidadeTipo: 'MENSAGEM',
        tipo: 'MENSAGEM_AUTOMATICA_CRIADA',
      },
      transacao,
    );
    await this.caixaSaida.acrescentar(
      {
        dados: { mensagemId: mensagem.id },
        destino: 'MENSAGERIA',
        tipo: 'ENVIAR_MENSAGEM',
      },
      evento,
      transacao,
    );
    return {
      mensagem,
      resultado: entrada.tipo === 'LISTA' ? 'FALLBACK' : 'SUCESSO',
    };
  }

  public async criarModeloAprovado(
    sessao: ContextoSessaoAutorizacao,
    entrada: {
      readonly atendimentoId: string;
      readonly contaWhatsAppId: string;
      readonly conversaId: string;
      readonly filaId: string;
      readonly mensagemClienteId: string;
      readonly modeloId: string;
      readonly parametros: readonly string[];
    },
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<MensagemSaidaPersistida> {
    if (
      ![
        entrada.atendimentoId,
        entrada.contaWhatsAppId,
        entrada.conversaId,
        entrada.filaId,
        entrada.mensagemClienteId,
        entrada.modeloId,
      ].every((id) => UUID.test(id)) ||
      !Array.isArray(entrada.parametros) ||
      entrada.parametros.length > 100 ||
      entrada.parametros.some((valor) => typeof valor !== 'string' || valor.trim().length < 1 || valor.length > 1_000)
    ) {
      throw new ErroMensagemInvalida();
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroMensagemInvalida();
    const conteudoProtegido = { modeloId: entrada.modeloId, parametros: [...entrada.parametros] };
    const conteudoHash = createHash('sha256').update(JSON.stringify(conteudoProtegido), 'utf8').digest('hex');
    await this.repositorio.bloquearIdempotencia(sessao.usuarioId, entrada.mensagemClienteId, transacao);
    const existente = await this.repositorio.obterPorIdempotencia(sessao.usuarioId, entrada.mensagemClienteId, transacao);
    if (existente !== undefined) {
      if (
        existente.conversaId !== entrada.conversaId ||
        existente.atendimentoId !== entrada.atendimentoId ||
        existente.contaWhatsAppId !== entrada.contaWhatsAppId ||
        existente.conteudoHash !== conteudoHash
      ) throw new ErroIdempotenciaMensagemDivergente();
      return existente;
    }
    let contexto: Awaited<ReturnType<RepositorioMensagens['obterContextoSaida']>> | undefined;
    await this.autorizacao.autorizar(
      {
        filaId: entrada.filaId,
        permissao: 'ENVIAR_MENSAGEM',
        recurso: { id: entrada.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => {
        contexto = await this.repositorio.obterContextoSaida(
          entrada.conversaId,
          entrada.atendimentoId,
          entrada.contaWhatsAppId,
          entrada.filaId,
          sessao.usuarioId,
          transacao,
        );
        return { acessivel: contexto !== undefined, estadoPermiteAcao: contexto?.permiteEnvio === true };
      },
      transacao,
    );
    if (
      contexto === undefined ||
      !(await this.repositorio.modeloAprovado(
        entrada.modeloId,
        entrada.contaWhatsAppId,
        entrada.parametros.length,
        transacao,
      ))
    ) throw new ErroMensagemInvalida();
    await this.janela.autorizarSaida(contexto.contatoId, contexto.contaWhatsAppId, 'MODELO_APROVADO', transacao, relogio);
    const mensagem: MensagemSaidaPersistida = {
      atendimentoId: entrada.atendimentoId,
      canceladaEm: undefined,
      codigoFalha: undefined,
      contatoRemetenteId: undefined,
      contaWhatsAppId: entrada.contaWhatsAppId,
      conteudoHash,
      conteudoProtegido,
      conversaId: entrada.conversaId,
      criadaDispositivoEm: undefined,
      direcao: 'SAIDA',
      entregueEm: undefined,
      enviadaEm: undefined,
      estadoSaida: 'NA_FILA',
      falhouEm: undefined,
      id: randomUUID(),
      identificadorExternoMensagem: undefined,
      lidaEm: undefined,
      mensagemClienteId: entrada.mensagemClienteId,
      proximaTentativaEm: agora,
      recebidaServidorEm: agora,
      tentativasEnvio: 0,
      tipo: 'MODELO_APROVADO',
      usuarioRemetenteId: sessao.usuarioId,
      versao: 1,
    };
    await this.repositorio.acrescentar(mensagem, transacao);
    const evento = await this.eventos.acrescentar(
      {
        atendimentoId: mensagem.atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: mensagem.conversaId,
        dados: { estado: 'NA_FILA', tipo: 'MODELO_APROVADO' },
        entidadeId: mensagem.id,
        entidadeTipo: 'MENSAGEM',
        tipo: 'MENSAGEM_SAIDA_CRIADA',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.caixaSaida.acrescentar(
      { dados: { mensagemId: mensagem.id }, destino: 'MENSAGERIA', tipo: 'ENVIAR_MENSAGEM' },
      evento,
      transacao,
    );
    return mensagem;
  }

  private validarEntrada(entrada: {
    readonly atendimentoId: string;
    readonly contaWhatsAppId: string;
    readonly conversaId: string;
    readonly criadaDispositivoEm?: Date;
    readonly filaId: string;
    readonly mensagemClienteId: string;
    readonly texto: unknown;
  }): string {
    if (
      ![
        entrada.atendimentoId,
        entrada.contaWhatsAppId,
        entrada.conversaId,
        entrada.filaId,
        entrada.mensagemClienteId,
      ].every((id) => UUID.test(id)) ||
      typeof entrada.texto !== 'string' ||
      entrada.texto.includes('\u0000') ||
      (entrada.criadaDispositivoEm !== undefined &&
        !Number.isFinite(entrada.criadaDispositivoEm.getTime()))
    ) {
      throw new ErroMensagemInvalida();
    }
    const texto = entrada.texto.trim();
    if (texto.length < 1 || texto.length > 4_096) {
      throw new ErroMensagemInvalida();
    }
    return texto;
  }

  private validarTextoAutomatico(valor: unknown): string | undefined {
    if (typeof valor !== 'string' || valor.includes('\u0000')) return undefined;
    const texto = valor.trim();
    return texto.length >= 1 && texto.length <= 4_096 ? texto : undefined;
  }

  private validarOpcoes(
    valor: unknown,
  ): readonly OpcaoMensagemAutomatica[] | undefined {
    if (!Array.isArray(valor) || valor.length < 1 || valor.length > 10) {
      return undefined;
    }
    const opcoes: OpcaoMensagemAutomatica[] = [];
    const ids = new Set<string>();
    for (const item of valor) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return undefined;
      }
      const chaves = Object.keys(item);
      const id = Reflect.get(item, 'id');
      const titulo = Reflect.get(item, 'titulo');
      const descricao = Reflect.get(item, 'descricao');
      if (
        !chaves.every((chave) => ['descricao', 'id', 'titulo'].includes(chave)) ||
        typeof id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/u.test(id) ||
        ids.has(id) ||
        typeof titulo !== 'string' ||
        titulo.trim().length < 1 ||
        titulo.length > 80 ||
        (descricao !== undefined &&
          (typeof descricao !== 'string' ||
            descricao.trim().length < 1 ||
            descricao.length > 120))
      ) {
        return undefined;
      }
      ids.add(id);
      opcoes.push({
        id,
        titulo: titulo.trim(),
        ...(descricao === undefined ? {} : { descricao: descricao.trim() }),
      });
    }
    return opcoes;
  }

  private comporFallbackLista(
    texto: string,
    opcoes: readonly OpcaoMensagemAutomatica[],
  ): string {
    return `${texto}\n\n${opcoes
      .map(
        (opcao, indice) =>
          `${indice + 1}. ${opcao.titulo}${
            opcao.descricao === undefined ? '' : ` — ${opcao.descricao}`
          }`,
      )
      .join('\n')}`;
  }
}
