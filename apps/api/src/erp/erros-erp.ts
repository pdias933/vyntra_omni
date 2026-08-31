export class ErroConsultaErpInvalida extends Error {
  public readonly codigo = 'CONSULTA_ERP_INVALIDA';

  public constructor() {
    super('CONSULTA_ERP_INVALIDA');
    this.name = 'ErroConsultaErpInvalida';
  }
}

export class ErroComandoErpInvalido extends Error {
  public readonly codigo = 'COMANDO_ERP_INVALIDO';

  public constructor() {
    super('COMANDO_ERP_INVALIDO');
    this.name = 'ErroComandoErpInvalido';
  }
}

export class ErroChaveErpReutilizada extends Error {
  public readonly codigo = 'CHAVE_ERP_REUTILIZADA';

  public constructor() {
    super('CHAVE_ERP_REUTILIZADA');
    this.name = 'ErroChaveErpReutilizada';
  }
}
