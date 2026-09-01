export class ErroContextoAtendimentoInvalido extends Error {
  public constructor() {
    super('CONTEXTO_ATENDIMENTO_INVALIDO');
    this.name = 'ErroContextoAtendimentoInvalido';
  }
}

export class ErroAlvoContextoIndisponivel extends Error {
  public constructor() {
    super('ALVO_CONTEXTO_INDISPONIVEL');
    this.name = 'ErroAlvoContextoIndisponivel';
  }
}

export class ErroConflitoVersaoContexto extends Error {
  public constructor() {
    super('CONFLITO_VERSAO_CONTEXTO');
    this.name = 'ErroConflitoVersaoContexto';
  }
}
