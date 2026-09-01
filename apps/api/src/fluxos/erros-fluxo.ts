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
