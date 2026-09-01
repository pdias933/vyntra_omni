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
