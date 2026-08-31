export class ErroComandoMensageriaInvalido extends Error {
  public readonly codigo = 'COMANDO_MENSAGERIA_INVALIDO';

  public constructor() {
    super('COMANDO_MENSAGERIA_INVALIDO');
    this.name = 'ErroComandoMensageriaInvalido';
  }
}

export class ErroEventoMensageriaInvalido extends Error {
  public readonly codigo = 'EVENTO_MENSAGERIA_INVALIDO';

  public constructor() {
    super('EVENTO_MENSAGERIA_INVALIDO');
    this.name = 'ErroEventoMensageriaInvalido';
  }
}

export class ErroChaveMensageriaReutilizada extends Error {
  public readonly codigo = 'CHAVE_MENSAGERIA_REUTILIZADA';

  public constructor() {
    super('CHAVE_MENSAGERIA_REUTILIZADA');
    this.name = 'ErroChaveMensageriaReutilizada';
  }
}
