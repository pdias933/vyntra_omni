export class ErroTransicaoAtendimentoInvalida extends Error {
  public constructor() {
    super('A transição solicitada não é válida para o estado atual.');
    this.name = 'ErroTransicaoAtendimentoInvalida';
  }
}

export class ErroInvarianteAtendimento extends Error {
  public constructor() {
    super('A combinação de estado, modo e motivo do atendimento é inválida.');
    this.name = 'ErroInvarianteAtendimento';
  }
}

