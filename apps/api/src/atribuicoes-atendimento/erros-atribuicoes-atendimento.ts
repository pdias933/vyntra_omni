export class ErroEntradaAtribuicaoAtendimentoInvalida extends Error {
  public constructor() {
    super('ENTRADA_ATRIBUICAO_ATENDIMENTO_INVALIDA');
    this.name = 'ErroEntradaAtribuicaoAtendimentoInvalida';
  }
}

export class ErroAtendimentoAtribuicaoAusente extends Error {
  public constructor() {
    super('ATENDIMENTO_ATRIBUICAO_AUSENTE');
    this.name = 'ErroAtendimentoAtribuicaoAusente';
  }
}

export class ErroConflitoResgateAtendimento extends Error {
  public constructor(
    public readonly usuarioResponsavelVencedorId?: string | undefined,
  ) {
    super('CONFLITO_RESGATE_ATENDIMENTO');
    this.name = 'ErroConflitoResgateAtendimento';
  }
}

export class ErroConflitoTransferenciaAtendimento extends Error {
  public constructor() {
    super('CONFLITO_TRANSFERENCIA_ATENDIMENTO');
    this.name = 'ErroConflitoTransferenciaAtendimento';
  }
}

export class ErroDestinatarioTransferenciaIndisponivel extends Error {
  public constructor() {
    super('DESTINATARIO_TRANSFERENCIA_INDISPONIVEL');
    this.name = 'ErroDestinatarioTransferenciaIndisponivel';
  }
}

export class ErroConflitoAssuncaoAtendimento extends Error {
  public constructor() {
    super('CONFLITO_ASSUNCAO_ATENDIMENTO');
    this.name = 'ErroConflitoAssuncaoAtendimento';
  }
}
