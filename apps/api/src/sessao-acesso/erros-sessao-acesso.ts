export class ErroEntradaSessaoAcessoInvalida extends Error {
  public readonly codigo = 'ENTRADA_SESSAO_ACESSO_INVALIDA';

  public constructor() {
    super('ENTRADA_SESSAO_ACESSO_INVALIDA');
    this.name = 'ErroEntradaSessaoAcessoInvalida';
  }
}

export class ErroChaveSessaoAcessoReutilizada extends Error {
  public readonly codigo = 'CHAVE_SESSAO_ACESSO_REUTILIZADA';

  public constructor() {
    super('CHAVE_SESSAO_ACESSO_REUTILIZADA');
    this.name = 'ErroChaveSessaoAcessoReutilizada';
  }
}
