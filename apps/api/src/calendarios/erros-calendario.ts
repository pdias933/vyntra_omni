export class ErroCalendarioInvalido extends Error {
  public constructor() {
    super('CALENDARIO_INVALIDO');
    this.name = 'ErroCalendarioInvalido';
  }
}

export class ErroCalendarioAusente extends Error {
  public constructor() {
    super('CALENDARIO_AUSENTE');
    this.name = 'ErroCalendarioAusente';
  }
}

export class ErroConflitoOverrideCalendario extends Error {
  public constructor() {
    super('CONFLITO_OVERRIDE_CALENDARIO');
    this.name = 'ErroConflitoOverrideCalendario';
  }
}
