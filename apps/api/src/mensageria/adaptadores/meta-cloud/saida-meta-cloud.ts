import type {
  ComandoEnvioMensagem,
  ResultadoEnvioMensagem,
} from '../../modelo-mensageria.js';
import type {
  CanalMensageria,
  ControleEnvioMensageria,
} from '../../porta-mensageria.js';
import {
  ErroTransporteMetaCloud,
  type ClienteHttpMetaCloud,
  type ProvedorConfiguracaoEnvioMetaCloud,
} from './cliente-http-meta-cloud.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSAO = /^v[1-9][0-9]*\.0$/u;
const IDENTIFICADOR_EXTERNO = /^[A-Za-z0-9._:-]{6,256}$/u;
const CODIGOS_TEMPORARIOS = new Set([
  1, 2, 4, 17, 32, 341, 368, 80_007, 130_429, 131_016,
]);
const CODIGOS_DESTINO = new Set([131_026, 131_049, 131_050]);
const CODIGOS_CONFIGURACAO = new Set([10, 190, 200, 131_005]);

interface ErroRespostaMetaCloud {
  readonly error?: {
    readonly code?: unknown;
  };
}

interface AceiteRespostaMetaCloud {
  readonly messages?: readonly {
    readonly id?: unknown;
  }[];
}

export class AdaptadorSaidaMetaCloud implements CanalMensageria {
  public constructor(
    private readonly cliente: ClienteHttpMetaCloud,
    private readonly configuracoes: ProvedorConfiguracaoEnvioMetaCloud,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  public async enviar(
    comando: ComandoEnvioMensagem,
    controle?: ControleEnvioMensageria,
  ): Promise<ResultadoEnvioMensagem> {
    if (
      !UUID.test(comando.comandoId) ||
      !UUID.test(comando.contaMensageriaId) ||
      comando.chaveIdempotencia.length < 16 ||
      comando.chaveIdempotencia.length > 128 ||
      comando.enderecoDestino.trim().length < 6 ||
      comando.enderecoDestino.length > 256 ||
      comando.conteudo.tipo !== 'TEXTO' ||
      comando.conteudo.texto.trim().length < 1 ||
      comando.conteudo.texto.length > 4_096
    ) {
      return this.falhaDefinitiva('CONTEUDO_REJEITADO');
    }
    const configuracao = await this.configuracoes.obter(
      comando.contaMensageriaId,
    );
    if (
      configuracao === undefined ||
      !VERSAO.test(configuracao.graphApiVersion) ||
      !IDENTIFICADOR_EXTERNO.test(configuracao.identificadorNumeroExterno) ||
      configuracao.tokenAcesso.length < 32
    ) {
      return {
        categoria: 'CONFIGURACAO',
        codigo: 'CANAL_NAO_CONFIGURADO',
        permiteNovaTentativa: false,
        resultado: 'FALHA',
      };
    }
    try {
      const resposta = await this.cliente.postarJson(
        `/${configuracao.graphApiVersion}/${configuracao.identificadorNumeroExterno}/messages`,
        configuracao.tokenAcesso,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          text: { body: comando.conteudo.texto, preview_url: false },
          to: comando.enderecoDestino,
          type: 'text',
          ...(comando.respostaAoIdentificadorExterno === undefined
            ? {}
            : { context: { message_id: comando.respostaAoIdentificadorExterno } }),
        },
        controle?.sinal,
      );
      return this.normalizarResposta(resposta.status, resposta.corpo);
    } catch (erro) {
      if (
        erro instanceof ErroTransporteMetaCloud ||
        controle?.sinal.aborted === true
      ) {
        return this.falhaTemporaria();
      }
      throw erro;
    }
  }

  private normalizarResposta(
    status: number,
    corpo: unknown,
  ): ResultadoEnvioMensagem {
    if (status >= 200 && status < 300) {
      const id = (corpo as AceiteRespostaMetaCloud).messages?.[0]?.id;
      if (typeof id !== 'string' || !IDENTIFICADOR_EXTERNO.test(id)) {
        return {
          categoria: 'CONFIGURACAO',
          codigo: 'CANAL_INDISPONIVEL',
          permiteNovaTentativa: false,
          resultado: 'FALHA',
        };
      }
      const aceitaEm = this.relogio();
      if (!Number.isFinite(aceitaEm.getTime())) return this.falhaTemporaria();
      return {
        aceitaEm,
        identificadorExternoMensagem: id,
        resultado: 'ACEITA',
      };
    }
    const codigoExterno = Number((corpo as ErroRespostaMetaCloud).error?.code);
    if (
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      CODIGOS_TEMPORARIOS.has(codigoExterno)
    ) {
      return this.falhaTemporaria();
    }
    if (status === 401 || status === 403 || CODIGOS_CONFIGURACAO.has(codigoExterno)) {
      return {
        categoria: 'CONFIGURACAO',
        codigo: 'CANAL_NAO_CONFIGURADO',
        permiteNovaTentativa: false,
        resultado: 'FALHA',
      };
    }
    return this.falhaDefinitiva(
      CODIGOS_DESTINO.has(codigoExterno)
        ? 'DESTINO_INVALIDO'
        : 'CONTEUDO_REJEITADO',
    );
  }

  private falhaTemporaria(): ResultadoEnvioMensagem {
    return {
      categoria: 'TEMPORARIA',
      codigo: 'CANAL_INDISPONIVEL',
      permiteNovaTentativa: true,
      resultado: 'FALHA',
    };
  }

  private falhaDefinitiva(
    codigo: 'CONTEUDO_REJEITADO' | 'DESTINO_INVALIDO',
  ): ResultadoEnvioMensagem {
    return {
      categoria: 'DEFINITIVA',
      codigo,
      permiteNovaTentativa: false,
      resultado: 'FALHA',
    };
  }
}
