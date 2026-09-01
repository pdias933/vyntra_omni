import type { MensagemSaidaPersistida } from './modelo-mensagem.js';

export interface CapacidadesRelacoesCanal {
  readonly respostaNativa: boolean;
  readonly reacaoNativa: boolean;
  readonly previaUrl: boolean;
}

export interface AlvoRelacaoMensagem {
  readonly id: string;
  readonly conversaId: string;
  readonly contaWhatsAppId: string;
  readonly identificadorExternoMensagem?: string;
  readonly resumoProtegido: string;
}

export interface PlanoRespostaCitada {
  readonly respondeAMensagemId: string;
  readonly modoCanal: 'CONTEXTO_NATIVO' | 'FALLBACK_TEXTO';
  readonly identificadorContextoExterno?: string;
  readonly previaProtegida: string;
}

export interface PlanoReacao {
  readonly mensagemAlvoReacaoId: string;
  readonly modoCanal: 'REACAO_NATIVA' | 'SOMENTE_INTERNO';
  readonly identificadorAlvoExterno?: string;
  readonly previaProtegida: string;
}

export class PlanejadorRelacoesMensagem {
  public planejarResposta(
    origem: Pick<MensagemSaidaPersistida, 'contaWhatsAppId' | 'conversaId'>,
    alvo: AlvoRelacaoMensagem,
    capacidades: CapacidadesRelacoesCanal,
  ): PlanoRespostaCitada {
    this.validarMesmoContexto(origem, alvo);
    const previaProtegida = this.previa(alvo.resumoProtegido);
    if (
      capacidades.respostaNativa &&
      alvo.identificadorExternoMensagem !== undefined
    ) {
      return {
        identificadorContextoExterno: alvo.identificadorExternoMensagem,
        modoCanal: 'CONTEXTO_NATIVO',
        previaProtegida,
        respondeAMensagemId: alvo.id,
      };
    }
    return {
      modoCanal: 'FALLBACK_TEXTO',
      previaProtegida,
      respondeAMensagemId: alvo.id,
    };
  }

  public planejarReacao(
    origem: Pick<MensagemSaidaPersistida, 'contaWhatsAppId' | 'conversaId'>,
    alvo: AlvoRelacaoMensagem,
    capacidades: CapacidadesRelacoesCanal,
  ): PlanoReacao {
    this.validarMesmoContexto(origem, alvo);
    const previaProtegida = this.previa(alvo.resumoProtegido);
    if (
      capacidades.reacaoNativa &&
      alvo.identificadorExternoMensagem !== undefined
    ) {
      return {
        identificadorAlvoExterno: alvo.identificadorExternoMensagem,
        mensagemAlvoReacaoId: alvo.id,
        modoCanal: 'REACAO_NATIVA',
        previaProtegida,
      };
    }
    return {
      mensagemAlvoReacaoId: alvo.id,
      modoCanal: 'SOMENTE_INTERNO',
      previaProtegida,
    };
  }

  public permitirPreviaUrl(capacidades: CapacidadesRelacoesCanal): boolean {
    return capacidades.previaUrl;
  }

  private previa(texto: string): string {
    const normalizado = texto.replaceAll(/\s+/gu, ' ').trim();
    if (normalizado.length < 1) throw new Error('RELACAO_MENSAGEM_INVALIDA');
    return normalizado.length <= 120
      ? normalizado
      : `${normalizado.slice(0, 117)}...`;
  }

  private validarMesmoContexto(
    origem: Pick<MensagemSaidaPersistida, 'contaWhatsAppId' | 'conversaId'>,
    alvo: AlvoRelacaoMensagem,
  ): void {
    if (
      alvo.id.length < 1 ||
      origem.conversaId !== alvo.conversaId ||
      origem.contaWhatsAppId !== alvo.contaWhatsAppId
    ) {
      throw new Error('RELACAO_MENSAGEM_INVALIDA');
    }
  }
}
