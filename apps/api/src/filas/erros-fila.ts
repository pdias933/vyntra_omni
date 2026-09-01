export class ErroFilaInvalida extends Error {
  public constructor() {
    super('A fila informada é inválida.');
    this.name = 'ErroFilaInvalida';
  }
}

export class ErroFilaDuplicada extends Error {
  public constructor() {
    super('Já existe uma fila com esse nome.');
    this.name = 'ErroFilaDuplicada';
  }
}

export class ErroFilaIndisponivel extends Error {
  public constructor() {
    super('A fila solicitada não está disponível.');
    this.name = 'ErroFilaIndisponivel';
  }
}

export class ErroUsuarioFilaIndisponivel extends Error {
  public constructor() {
    super('O usuário solicitado não está disponível para vínculo.');
    this.name = 'ErroUsuarioFilaIndisponivel';
  }
}

