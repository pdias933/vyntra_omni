export class ErroEntradaOrdemServicoInvalida extends Error {
  public constructor() {
    super('ENTRADA_ORDEM_SERVICO_INVALIDA');
    this.name = 'ErroEntradaOrdemServicoInvalida';
  }
}

export class ErroRespostaOrdemServicoInvalida extends Error {
  public constructor() {
    super('RESPOSTA_ORDEM_SERVICO_INVALIDA');
    this.name = 'ErroRespostaOrdemServicoInvalida';
  }
}
