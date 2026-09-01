export class ErroEntradaDesbloqueioConfiancaInvalida extends Error {
  public constructor() {
    super('ENTRADA_DESBLOQUEIO_CONFIANCA_INVALIDA');
    this.name = 'ErroEntradaDesbloqueioConfiancaInvalida';
  }
}

export class ErroRespostaElegibilidadeDesbloqueioInvalida extends Error {
  public constructor() {
    super('RESPOSTA_ELEGIBILIDADE_DESBLOQUEIO_INVALIDA');
    this.name = 'ErroRespostaElegibilidadeDesbloqueioInvalida';
  }
}
