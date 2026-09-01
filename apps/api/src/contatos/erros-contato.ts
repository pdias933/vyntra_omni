export class ErroObservacaoIdentidadeInvalida extends Error {
  public constructor() {
    super('OBSERVACAO_IDENTIDADE_INVALIDA');
    this.name = 'ErroObservacaoIdentidadeInvalida';
  }
}

export class ErroContaWhatsAppIndisponivel extends Error {
  public constructor() {
    super('CONTA_WHATSAPP_INDISPONIVEL');
    this.name = 'ErroContaWhatsAppIndisponivel';
  }
}

export class ErroAlteracaoIdentidadeInvalida extends Error {
  public constructor() {
    super('ALTERACAO_IDENTIDADE_INVALIDA');
    this.name = 'ErroAlteracaoIdentidadeInvalida';
  }
}
