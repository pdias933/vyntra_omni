export class ErroFluxoInvalido extends Error {
  public constructor() {
    super('FLUXO_INVALIDO');
    this.name = 'ErroFluxoInvalido';
  }
}

export class ErroFluxoDuplicado extends Error {
  public constructor() {
    super('FLUXO_DUPLICADO');
    this.name = 'ErroFluxoDuplicado';
  }
}

export class ErroFluxoIndisponivel extends Error {
  public constructor() {
    super('FLUXO_INDISPONIVEL');
    this.name = 'ErroFluxoIndisponivel';
  }
}

export class ErroVersaoFluxoIndisponivel extends Error {
  public constructor() {
    super('VERSAO_FLUXO_INDISPONIVEL');
    this.name = 'ErroVersaoFluxoIndisponivel';
  }
}

export class ErroVersaoFluxoNaoEditavel extends Error {
  public constructor() {
    super('VERSAO_FLUXO_NAO_EDITAVEL');
    this.name = 'ErroVersaoFluxoNaoEditavel';
  }
}

export class ErroConflitoVersaoFluxo extends Error {
  public constructor() {
    super('CONFLITO_VERSAO_FLUXO');
    this.name = 'ErroConflitoVersaoFluxo';
  }
}

export class ErroVersaoPublicadaIndisponivel extends Error {
  public constructor() {
    super('VERSAO_PUBLICADA_FLUXO_INDISPONIVEL');
    this.name = 'ErroVersaoPublicadaIndisponivel';
  }
}

export class ErroVersaoFluxoNaoPublicavel extends Error {
  public constructor() {
    super('VERSAO_FLUXO_NAO_PUBLICAVEL');
    this.name = 'ErroVersaoFluxoNaoPublicavel';
  }
}

export class ErroTransicaoPublicacaoFluxoInvalida extends Error {
  public constructor() {
    super('TRANSICAO_PUBLICACAO_FLUXO_INVALIDA');
    this.name = 'ErroTransicaoPublicacaoFluxoInvalida';
  }
}

export class ErroFluxoNaoPublicavel extends Error {
  public constructor(
    public readonly problemas: readonly Readonly<Record<string, string>>[],
  ) {
    super('FLUXO_NAO_PUBLICAVEL');
    this.name = 'ErroFluxoNaoPublicavel';
  }
}

export class ErroVersaoFluxoNaoValidavel extends Error {
  public constructor() {
    super('VERSAO_FLUXO_NAO_VALIDAVEL');
    this.name = 'ErroVersaoFluxoNaoValidavel';
  }
}
