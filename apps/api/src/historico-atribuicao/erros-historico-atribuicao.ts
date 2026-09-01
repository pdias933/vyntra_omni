export class ErroHistoricoAtribuicaoInvalido extends Error {
  public constructor() {
    super('HISTORICO_ATRIBUICAO_INVALIDO');
    this.name = 'ErroHistoricoAtribuicaoInvalido';
  }
}

export class ErroConflitoHistoricoAtribuicao extends Error {
  public constructor() {
    super('CONFLITO_HISTORICO_ATRIBUICAO');
    this.name = 'ErroConflitoHistoricoAtribuicao';
  }
}

export class ErroAtendimentoHistoricoAtribuicaoAusente extends Error {
  public constructor() {
    super('ATENDIMENTO_HISTORICO_ATRIBUICAO_AUSENTE');
    this.name = 'ErroAtendimentoHistoricoAtribuicaoAusente';
  }
}
