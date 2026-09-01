export class ErroProtocoloErpInvalido extends Error {
  public constructor() {
    super('O protocolo ERP informado é inválido.');
    this.name = 'ErroProtocoloErpInvalido';
  }
}

export class ErroAtendimentoProtocoloAusente extends Error {
  public constructor() {
    super('O atendimento solicitado não está disponível.');
    this.name = 'ErroAtendimentoProtocoloAusente';
  }
}

export class ErroConflitoProtocoloErp extends Error {
  public constructor() {
    super('O protocolo ERP não pôde ser confirmado de forma consistente.');
    this.name = 'ErroConflitoProtocoloErp';
  }
}

