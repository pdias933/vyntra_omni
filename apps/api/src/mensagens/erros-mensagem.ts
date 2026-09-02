import type { MotivoRevisaoPendenciaTexto } from './modelo-mensagem.js';

export class ErroMensagemInvalida extends Error {
  public constructor() {
    super('MENSAGEM_INVALIDA');
    this.name = 'ErroMensagemInvalida';
  }
}

export class ErroTransicaoMensagemInvalida extends Error {
  public constructor() {
    super('TRANSICAO_ESTADO_MENSAGEM_INVALIDA');
    this.name = 'ErroTransicaoMensagemInvalida';
  }
}

export class ErroIdempotenciaMensagemDivergente extends Error {
  public constructor() {
    super('IDEMPOTENCIA_MENSAGEM_DIVERGENTE');
    this.name = 'ErroIdempotenciaMensagemDivergente';
  }
}

export class ErroRevisaoPendenciaTextoNecessaria extends Error {
  public constructor(
    public readonly motivos: readonly MotivoRevisaoPendenciaTexto[],
  ) {
    super('REVISAO_PENDENCIA_TEXTO_NECESSARIA');
    this.name = 'ErroRevisaoPendenciaTextoNecessaria';
  }
}
