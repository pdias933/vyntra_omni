export class ErroEntradaAcaoAtendimentoErpInvalida extends Error {
  public constructor() {
    super('ENTRADA_ACAO_ATENDIMENTO_ERP_INVALIDA');
    this.name = 'ErroEntradaAcaoAtendimentoErpInvalida';
  }
}
