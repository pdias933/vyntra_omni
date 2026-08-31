import { createHash } from 'node:crypto';

import {
  ErroChaveMensageriaReutilizada,
  ErroComandoMensageriaInvalido,
  ErroEventoMensageriaInvalido,
} from '../../erros-mensageria.js';
import type {
  CodigoFalhaMensageria,
  ComandoEnvioMensagem,
  EventoRecebidoMensageria,
  ResultadoEnvioMensagem,
  ResultadoRecepcaoMensageria,
} from '../../modelo-mensageria.js';
import type {
  CanalMensageria,
  ConsumidorEventosMensageria,
} from '../../porta-mensageria.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{16,128}$/u;
const E164 = /^\+[1-9][0-9]{7,14}$/u;

interface RecepcaoEmAndamento {
  readonly assinatura: string;
  readonly processamento: Promise<ResultadoRecepcaoMensageria>;
}

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function normalizarParaAssinatura(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(normalizarParaAssinatura);
  if (typeof valor !== 'object' || valor === null) return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([, item]) => item !== undefined)
      .sort(([esquerda], [direita]) => esquerda.localeCompare(direita))
      .map(([chave, item]) => [chave, normalizarParaAssinatura(item)]),
  );
}

function assinaturaComando(comando: ComandoEnvioMensagem): string {
  return hashHex(
    JSON.stringify(normalizarParaAssinatura(comando)),
  );
}

function assinaturaEvento(evento: EventoRecebidoMensageria): string {
  return hashHex(
    JSON.stringify(normalizarParaAssinatura(evento)),
  );
}

function textoValido(valor: string, limite: number): boolean {
  return valor.trim().length > 0 && valor.length <= limite;
}

export class AdaptadorMetaCloudSimulado implements CanalMensageria {
  private readonly resultadosProgramados = new Map<
    string,
    ResultadoEnvioMensagem
  >();

  private readonly envios = new Map<
    string,
    { readonly assinatura: string; readonly resultado: ResultadoEnvioMensagem }
  >();

  private readonly recepcoes = new Map<string, RecepcaoEmAndamento>();
  private tentativasExternas = 0;
  private eventosEntregues = 0;

  public constructor(
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  public programarFalha(
    chaveIdempotencia: string,
    falha: {
      readonly categoria: 'CONFIGURACAO' | 'DEFINITIVA' | 'TEMPORARIA';
      readonly codigo: CodigoFalhaMensageria;
      readonly permiteNovaTentativa: boolean;
    },
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      (falha.categoria === 'TEMPORARIA') !== falha.permiteNovaTentativa
    ) {
      throw new ErroComandoMensageriaInvalido();
    }
    this.resultadosProgramados.set(chaveIdempotencia, {
      ...falha,
      resultado: 'FALHA',
    });
  }

  public async enviar(
    comando: ComandoEnvioMensagem,
  ): Promise<ResultadoEnvioMensagem> {
    this.validarComando(comando);
    const assinatura = assinaturaComando(comando);
    const anterior = this.envios.get(comando.chaveIdempotencia);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveMensageriaReutilizada();
      }
      return anterior.resultado;
    }

    this.tentativasExternas += 1;
    const resultado =
      this.resultadosProgramados.get(comando.chaveIdempotencia) ??
      this.criarAceite(comando);
    this.envios.set(comando.chaveIdempotencia, { assinatura, resultado });
    return resultado;
  }

  public async simularRecepcao(
    evento: EventoRecebidoMensageria,
    consumidor: ConsumidorEventosMensageria,
  ): Promise<ResultadoRecepcaoMensageria> {
    this.validarEvento(evento);
    const chave = `${evento.contaMensageriaId}:${evento.identificadorEvento}`;
    const assinatura = assinaturaEvento(evento);
    const anterior = this.recepcoes.get(chave);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveMensageriaReutilizada();
      }
      await anterior.processamento;
      return { resultado: 'DUPLICADO' };
    }

    const processamento = consumidor.receber(evento).then((resultado) => {
      this.eventosEntregues += 1;
      return { resultado };
    });
    this.recepcoes.set(chave, { assinatura, processamento });
    try {
      return await processamento;
    } catch (erro) {
      this.recepcoes.delete(chave);
      throw erro;
    }
  }

  public normalizarEstadoSimulado(entrada: {
    readonly estadoMeta: 'delivered' | 'failed' | 'read' | 'sent';
    readonly identificadorEvento: string;
    readonly contaMensageriaId: string;
    readonly identificadorExternoMensagem: string;
    readonly ocorridoEm: Date;
    readonly codigoFalha?: CodigoFalhaMensageria;
  }): EventoRecebidoMensageria {
    const estados = {
      delivered: 'ENTREGUE',
      failed: 'FALHOU',
      read: 'LIDA',
      sent: 'ENVIADA',
    } as const;
    if (entrada.estadoMeta === 'failed' && entrada.codigoFalha === undefined) {
      throw new ErroEventoMensageriaInvalido();
    }
    return {
      contaMensageriaId: entrada.contaMensageriaId,
      estado: estados[entrada.estadoMeta],
      identificadorEvento: entrada.identificadorEvento,
      identificadorExternoMensagem: entrada.identificadorExternoMensagem,
      ocorridoEm: entrada.ocorridoEm,
      tipo: 'ESTADO_MENSAGEM_ATUALIZADO',
      ...(entrada.codigoFalha === undefined
        ? {}
        : { codigoFalha: entrada.codigoFalha }),
    };
  }

  public obterQuantidadeTentativasExternas(): number {
    return this.tentativasExternas;
  }

  public obterQuantidadeEventosEntregues(): number {
    return this.eventosEntregues;
  }

  private criarAceite(
    comando: ComandoEnvioMensagem,
  ): ResultadoEnvioMensagem {
    return {
      aceitaEm: this.relogio(),
      identificadorExternoMensagem: `simulado.${hashHex(
        `${comando.contaMensageriaId}:${comando.chaveIdempotencia}`,
      ).slice(0, 40)}`,
      resultado: 'ACEITA',
    };
  }

  private validarComando(comando: ComandoEnvioMensagem): void {
    if (
      !IDENTIFICADOR_UUID.test(comando.comandoId) ||
      !IDENTIFICADOR_UUID.test(comando.contaMensageriaId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      !textoValido(comando.enderecoDestino, 256) ||
      !this.conteudoValido(comando.conteudo)
    ) {
      throw new ErroComandoMensageriaInvalido();
    }
  }

  private validarEvento(evento: EventoRecebidoMensageria): void {
    const instante =
      evento.tipo === 'MENSAGEM_RECEBIDA'
        ? evento.recebidoEm
        : evento.ocorridoEm;
    const baseValida =
      IDENTIFICADOR_UUID.test(evento.contaMensageriaId) &&
      textoValido(evento.identificadorEvento, 256) &&
      textoValido(evento.identificadorExternoMensagem, 256) &&
      !Number.isNaN(instante.getTime());
    const detalheValido =
      evento.tipo === 'MENSAGEM_RECEBIDA'
        ? textoValido(evento.identidade.identificadorTecnico, 256) &&
          (evento.identidade.telefoneE164 === undefined ||
            E164.test(evento.identidade.telefoneE164)) &&
          this.conteudoValido(evento.conteudo)
        : evento.estado !== 'FALHOU' || evento.codigoFalha !== undefined;
    if (!baseValida || !detalheValido) {
      throw new ErroEventoMensageriaInvalido();
    }
  }

  private conteudoValido(conteudo: ComandoEnvioMensagem['conteudo']): boolean {
    switch (conteudo.tipo) {
      case 'TEXTO':
        return textoValido(conteudo.texto, 4_096);
      case 'MIDIA':
        return (
          IDENTIFICADOR_UUID.test(conteudo.midiaId) &&
          (conteudo.legenda === undefined ||
            conteudo.legenda.length <= 4_096) &&
          (conteudo.nomeArquivo === undefined ||
            textoValido(conteudo.nomeArquivo, 255))
        );
      case 'MODELO_APROVADO':
        return (
          IDENTIFICADOR_UUID.test(conteudo.modeloId) &&
          /^[a-z]{2}(?:_[A-Z]{2})?$/u.test(conteudo.idioma) &&
          Object.keys(conteudo.parametros).length <= 64 &&
          Object.entries(conteudo.parametros).every(
            ([chave, valor]) =>
              textoValido(chave, 80) && textoValido(valor, 4_096),
          )
        );
      case 'INTERATIVA':
        return IDENTIFICADOR_UUID.test(conteudo.composicaoId);
      case 'REACAO':
        return (
          textoValido(conteudo.identificadorExternoMensagemAlvo, 256) &&
          textoValido(conteudo.simbolo, 16)
        );
    }
  }
}
