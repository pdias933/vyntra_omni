export class ErroPermissaoNegada extends Error {
  public readonly codigo = 'PERMISSAO_NEGADA';

  public constructor() {
    super('PERMISSAO_NEGADA');
    this.name = 'ErroPermissaoNegada';
  }
}

export class ErroNaoAutenticado extends Error {
  public readonly codigo = 'NAO_AUTENTICADO';

  public constructor() {
    super('NAO_AUTENTICADO');
    this.name = 'ErroNaoAutenticado';
  }
}
