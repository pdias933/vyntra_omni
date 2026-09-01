export class ErroEntradaSlaInvalida extends Error {
  public constructor() {
    super('ENTRADA_SLA_INVALIDA');
  }
}

export class ErroObrigacaoHumanaInexistente extends Error {
  public constructor() {
    super('OBRIGACAO_HUMANA_INEXISTENTE');
  }
}

export class ErroPoliticaSlaAusente extends Error {
  public constructor() {
    super('POLITICA_SLA_AUSENTE');
  }
}

export class ErroAtendimentoSemObrigacaoHumana extends Error {
  public constructor() {
    super('ATENDIMENTO_SEM_OBRIGACAO_HUMANA');
  }
}
