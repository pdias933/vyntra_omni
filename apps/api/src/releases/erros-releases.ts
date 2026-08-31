export class ErroConfiguracaoReleaseInvalida extends Error {
  public readonly codigo = 'CONFIGURACAO_RELEASE_INVALIDA';

  public constructor() {
    super('CONFIGURACAO_RELEASE_INVALIDA');
    this.name = 'ErroConfiguracaoReleaseInvalida';
  }
}

export class ErroConflitoVersaoRelease extends Error {
  public readonly codigo = 'CONFLITO_VERSAO_RELEASE';

  public constructor() {
    super('CONFLITO_VERSAO_RELEASE');
    this.name = 'ErroConflitoVersaoRelease';
  }
}

export class ErroAtualizacaoObrigatoria extends Error {
  public readonly codigo = 'ATUALIZACAO_OBRIGATORIA';

  public constructor() {
    super('ATUALIZACAO_OBRIGATORIA');
    this.name = 'ErroAtualizacaoObrigatoria';
  }
}
