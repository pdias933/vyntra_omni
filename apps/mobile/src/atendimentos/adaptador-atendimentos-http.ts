import {
  alterarContextoContatoMobile,
  client,
  confirmarLeituraTimelineMobile,
  consultarFinanceiroContatoMobile,
  enviarModeloAprovadoMobile,
  enviarTextoMobile,
  obterDetalhesContatoMobile,
  obterTimelineMobile,
  reconciliarTextoMobile,
  listarModelosAprovadosMobile,
  listarRespostasRapidasMobile,
} from '@vyntra/api-client';

import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import type { CredenciaisSincronizacaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import {
  normalizarDetalhesContatoMobile,
  normalizarMensagemCriadaMobile,
  normalizarModelosAprovadosMobile,
  normalizarPaginaTimelineMobile,
  normalizarRespostasRapidasMobile,
  normalizarResultadoReconciliacaoTextoMobile,
  normalizarResumoFinanceiroMobile,
  normalizarVersaoMarcador,
  type DetalhesContatoMobile,
  type MensagemCriadaMobile,
  type ModeloAprovadoMobile,
  type PaginaTimelineMobile,
  type RespostaRapidaMobile,
  type ResumoFinanceiroContatoMobile,
  type ResultadoReconciliacaoTextoMobile,
} from './modelo-atendimento-mobile';

interface RespostaSdk<T> {
  readonly data?: T | undefined;
  readonly error?: unknown | undefined;
  readonly response?: Response | undefined;
}

export class ErroAtendimentoMobile extends Error {
  public constructor(
    public readonly codigo: string,
    public readonly statusHttp?: number,
  ) {
    super(codigo);
    this.name = 'ErroAtendimentoMobile';
  }
}

function codigoErro(valor: unknown): string {
  if (valor !== null && typeof valor === 'object') {
    const direto = Reflect.get(valor, 'codigo');
    if (typeof direto === 'string' && direto.length > 0) return direto;
    const interno = Reflect.get(valor, 'erro');
    if (interno !== null && typeof interno === 'object') {
      const encapsulado = Reflect.get(interno, 'codigo');
      if (typeof encapsulado === 'string' && encapsulado.length > 0) {
        return encapsulado;
      }
    }
  }
  return 'ATENDIMENTO_INDISPONIVEL';
}

function exigirDado<T>(resposta: RespostaSdk<T>): T {
  if (resposta.data !== undefined) return resposta.data;
  throw new ErroAtendimentoMobile(
    codigoErro(resposta.error),
    resposta.response?.status,
  );
}

function opcoesAutenticadas(credenciais: CredenciaisSincronizacaoAplicativo) {
  return {
    auth: credenciais.tokenAcesso,
    headers: {
      'x-dispositivo-id': credenciais.dispositivoId,
      'x-segredo-dispositivo': credenciais.segredoDispositivo,
    },
  } as const;
}

client.setConfig({ baseUrl: CONFIGURACAO_APLICATIVO.servidor });

export class AdaptadorAtendimentosHttp {
  public async listarRespostasRapidas(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    busca = '',
  ): Promise<readonly RespostaRapidaMobile[]> {
    const resposta = await listarRespostasRapidasMobile({
      ...opcoesAutenticadas(credenciais),
      path: { atendimentoId },
      query: { busca },
    });
    try {
      return normalizarRespostasRapidasMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async enviarTexto(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    entrada: {
      readonly mensagemClienteId: string;
      readonly respondeAMensagemId?: string;
      readonly texto: string;
    },
  ): Promise<MensagemCriadaMobile> {
    const resposta = await enviarTextoMobile({
      ...opcoesAutenticadas(credenciais),
      body: {
        mensagem_cliente_id: entrada.mensagemClienteId,
        ...(entrada.respondeAMensagemId === undefined
          ? {}
          : { responde_a_mensagem_id: entrada.respondeAMensagemId }),
        texto: entrada.texto,
      },
      path: { atendimentoId },
    });
    try {
      return normalizarMensagemCriadaMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async reconciliarTexto(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    entrada: {
      readonly chaveIdempotencia: string;
      readonly criadaEm: string;
      readonly janelaObservada: string;
      readonly sequenciaObservada: string;
      readonly texto: string;
      readonly versaoAtribuicao: number;
      readonly versaoContexto: number;
      readonly versaoEstado: number;
    },
  ): Promise<ResultadoReconciliacaoTextoMobile> {
    const resposta = await reconciliarTextoMobile({
      ...opcoesAutenticadas(credenciais),
      body: {
        criada_dispositivo_em: entrada.criadaEm,
        janela_expira_em_observada: entrada.janelaObservada,
        mensagem_cliente_id: entrada.chaveIdempotencia,
        sequencia_observada: entrada.sequenciaObservada,
        texto: entrada.texto,
        versao_atribuicao_observada: entrada.versaoAtribuicao,
        versao_contexto_observada: entrada.versaoContexto,
        versao_estado_observada: entrada.versaoEstado,
      },
      path: { atendimentoId },
    });
    try {
      return normalizarResultadoReconciliacaoTextoMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async listarModelosAprovados(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    busca = '',
  ): Promise<readonly ModeloAprovadoMobile[]> {
    const resposta = await listarModelosAprovadosMobile({
      ...opcoesAutenticadas(credenciais),
      path: { atendimentoId },
      query: { busca },
    });
    try {
      return normalizarModelosAprovadosMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async enviarModeloAprovado(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    entrada: {
      readonly mensagemClienteId: string;
      readonly modeloId: string;
      readonly parametros: readonly string[];
    },
  ): Promise<MensagemCriadaMobile> {
    const resposta = await enviarModeloAprovadoMobile({
      ...opcoesAutenticadas(credenciais),
      body: {
        mensagem_cliente_id: entrada.mensagemClienteId,
        modelo_id: entrada.modeloId,
        parametros: [...entrada.parametros],
      },
      path: { atendimentoId },
    });
    try {
      return normalizarMensagemCriadaMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async obterTimeline(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    cursor?: string,
  ): Promise<PaginaTimelineMobile> {
    const resposta = await obterTimelineMobile({
      ...opcoesAutenticadas(credenciais),
      path: { atendimentoId },
      ...(cursor === undefined ? {} : { query: { cursor } }),
    });
    try {
      return normalizarPaginaTimelineMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async obterDetalhes(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
  ): Promise<DetalhesContatoMobile> {
    const resposta = await obterDetalhesContatoMobile({
      ...opcoesAutenticadas(credenciais),
      path: { atendimentoId },
    });
    try {
      return normalizarDetalhesContatoMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async confirmarLeitura(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    mensagemId: string,
    versaoEsperada: number,
  ): Promise<number> {
    const resposta = await confirmarLeituraTimelineMobile({
      ...opcoesAutenticadas(credenciais),
      body: {
        mensagem_id: mensagemId,
        versao_esperada: versaoEsperada,
      },
      path: { atendimentoId },
    });
    try {
      return normalizarVersaoMarcador(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async consultarFinanceiro(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
  ): Promise<ResumoFinanceiroContatoMobile> {
    const resposta = await consultarFinanceiroContatoMobile({
      ...opcoesAutenticadas(credenciais),
      path: { atendimentoId },
    });
    try {
      return normalizarResumoFinanceiroMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }

  public async alterarContexto(
    credenciais: CredenciaisSincronizacaoAplicativo,
    atendimentoId: string,
    entrada: {
      readonly versaoEsperada: number;
      readonly vinculoClienteId: string;
      readonly vinculoContratoId?: string;
    },
  ): Promise<DetalhesContatoMobile> {
    const resposta = await alterarContextoContatoMobile({
      ...opcoesAutenticadas(credenciais),
      body: {
        versao_esperada: entrada.versaoEsperada,
        vinculo_cliente_id: entrada.vinculoClienteId,
        ...(entrada.vinculoContratoId === undefined
          ? {}
          : { vinculo_contrato_id: entrada.vinculoContratoId }),
      },
      path: { atendimentoId },
    });
    try {
      return normalizarDetalhesContatoMobile(exigirDado(resposta));
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile) throw erro;
      throw new ErroAtendimentoMobile('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
  }
}
