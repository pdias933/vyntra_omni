import { createHash, randomUUID } from 'node:crypto';

import {
  AutenticadorAplicacaoIntegracao,
} from './autenticador-aplicacao-integracao.js';
import type {
  AplicacaoIntegracao,
  ConsentimentoContatoCanal,
  DisparoTransacionalPlanejado,
  MensagemTransacionalPlanejada,
  RetornoDisparoTransacional,
} from './modelo-disparo-transacional.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ErroConsentimentoTransacional extends Error {
  public constructor() {
    super('CONSENTIMENTO_TRANSACIONAL_NAO_CONCEDIDO');
  }
}

export class ErroIdempotenciaDisparoDivergente extends Error {
  public constructor() {
    super('IDEMPOTENCIA_DISPARO_DIVERGENTE');
  }
}

export class ErroComandoDisparoInvalido extends Error {
  public constructor() {
    super('COMANDO_DISPARO_INVALIDO');
  }
}

interface EntradaDisparoTransacional {
  readonly atendimentoId: string;
  readonly chaveIdempotencia: string;
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly conversaId: string;
  readonly idioma: string;
  readonly modeloId: string;
  readonly parametros: Readonly<Record<string, string>>;
  readonly segredoAplicacao: string;
}

export class PlanejadorDisparoTransacional {
  public constructor(
    private readonly autenticador = new AutenticadorAplicacaoIntegracao(),
  ) {}

  public planejar(
    aplicacao: AplicacaoIntegracao,
    consentimento: ConsentimentoContatoCanal,
    entrada: EntradaDisparoTransacional,
    existente?: DisparoTransacionalPlanejado,
    relogio: () => Date = () => new Date(),
  ):
    | { readonly resultado: 'CRIADO'; readonly disparo: DisparoTransacionalPlanejado; readonly evento: Readonly<Record<string, string>>; readonly caixaSaida: Readonly<Record<string, string>> }
    | { readonly resultado: 'REPETIDO'; readonly disparo: DisparoTransacionalPlanejado } {
    this.autenticador.autenticar(aplicacao, entrada.segredoAplicacao);
    this.validarEntrada(entrada);
    if (
      consentimento.estado !== 'CONCEDIDO' ||
      consentimento.finalidade !== 'MENSAGEM_TRANSACIONAL' ||
      consentimento.contatoId !== entrada.contatoId ||
      consentimento.contaWhatsAppId !== entrada.contaWhatsAppId
    ) {
      throw new ErroConsentimentoTransacional();
    }
    const chaveIdempotenciaHash = hash(
      `${aplicacao.id}\u0000${entrada.chaveIdempotencia}`,
    );
    const conteudoProtegido = {
      idioma: entrada.idioma,
      modeloId: entrada.modeloId,
      parametros: entrada.parametros,
    };
    const conteudoHash = hash(serializarOrdenado(conteudoProtegido));
    const assinaturaComandoHash = hash(
      serializarOrdenado({
        atendimentoId: entrada.atendimentoId,
        contatoId: entrada.contatoId,
        contaWhatsAppId: entrada.contaWhatsAppId,
        conteudoHash,
        conversaId: entrada.conversaId,
      }),
    );
    if (existente !== undefined) {
      if (
        existente.aplicacaoIntegracaoId !== aplicacao.id ||
        existente.chaveIdempotenciaHash !== chaveIdempotenciaHash ||
        existente.assinaturaComandoHash !== assinaturaComandoHash
      ) {
        throw new ErroIdempotenciaDisparoDivergente();
      }
      return { disparo: existente, resultado: 'REPETIDO' };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroComandoDisparoInvalido();
    const mensagem: MensagemTransacionalPlanejada = {
      atendimentoId: entrada.atendimentoId,
      contatoRemetenteId: undefined,
      contaWhatsAppId: entrada.contaWhatsAppId,
      conteudoHash,
      conteudoProtegido,
      conversaId: entrada.conversaId,
      direcao: 'SAIDA',
      estadoSaida: 'NA_FILA',
      id: randomUUID(),
      recebidaServidorEm: agora,
      tipo: 'MODELO_APROVADO',
      usuarioRemetenteId: undefined,
    };
    const disparo: DisparoTransacionalPlanejado = {
      aplicacaoIntegracaoId: aplicacao.id,
      assinaturaComandoHash,
      chaveIdempotenciaHash,
      consentimentoId: consentimento.id,
      criadoEm: agora,
      id: randomUUID(),
      mensagem,
      mensagemId: mensagem.id,
    };
    return {
      caixaSaida: { destino: 'MENSAGERIA', mensagemId: mensagem.id, tipo: 'ENVIAR_MENSAGEM' },
      disparo,
      evento: { estado: 'NA_FILA', mensagemId: mensagem.id, tipo: 'DISPARO_TRANSACIONAL_CRIADO' },
      resultado: 'CRIADO',
    };
  }

  public obterRetorno(
    disparo: DisparoTransacionalPlanejado,
    mensagem: MensagemTransacionalPlanejada,
  ): RetornoDisparoTransacional {
    if (disparo.mensagemId !== mensagem.id) throw new ErroComandoDisparoInvalido();
    return { disparoId: disparo.id, estado: mensagem.estadoSaida, mensagemId: mensagem.id };
  }

  private validarEntrada(entrada: EntradaDisparoTransacional): void {
    if (
      ![entrada.atendimentoId, entrada.contatoId, entrada.contaWhatsAppId, entrada.conversaId, entrada.modeloId].every((id) => UUID.test(id)) ||
      entrada.chaveIdempotencia.trim().length < 8 ||
      entrada.chaveIdempotencia.length > 200 ||
      !/^[a-z]{2,3}_[A-Z]{2}$/u.test(entrada.idioma) ||
      Object.keys(entrada.parametros).length > 50 ||
      Object.values(entrada.parametros).some((valor) => typeof valor !== 'string' || valor.length > 1_000)
    ) {
      throw new ErroComandoDisparoInvalido();
    }
  }
}

function hash(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function serializarOrdenado(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(serializarOrdenado).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    return `{${Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([chave, item]) => `${JSON.stringify(chave)}:${serializarOrdenado(item)}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}
