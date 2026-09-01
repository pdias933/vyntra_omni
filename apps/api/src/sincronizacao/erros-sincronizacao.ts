export class ErroCursorSincronizacaoInvalido extends Error {
  public constructor() {
    super('CURSOR_SINCRONIZACAO_INVALIDO');
  }
}

export class ErroRessincronizacaoCompletaNecessaria extends Error {
  public constructor() {
    super('RESSINCRONIZACAO_COMPLETA_NECESSARIA');
  }
}
