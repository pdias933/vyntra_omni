export class ErroMidiaInvalida extends Error {
  public constructor(codigo = 'MIDIA_INVALIDA') {
    super(codigo);
    this.name = 'ErroMidiaInvalida';
  }
}
