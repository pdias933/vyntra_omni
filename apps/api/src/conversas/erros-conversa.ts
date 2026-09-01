export class ErroEntradaConversaInvalida extends Error {
  public constructor() {
    super('ENTRADA_CONVERSA_INVALIDA');
    this.name = 'ErroEntradaConversaInvalida';
  }
}

export class ErroOrigemConversaIndisponivel extends Error {
  public constructor() {
    super('ORIGEM_CONVERSA_INDISPONIVEL');
    this.name = 'ErroOrigemConversaIndisponivel';
  }
}

export class ErroConflitoConversa extends Error {
  public constructor() {
    super('CONFLITO_CONVERSA');
    this.name = 'ErroConflitoConversa';
  }
}
