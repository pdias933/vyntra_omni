export class ErroExecucaoFluxoInvalida extends Error {
  public constructor() {
    super('EXECUCAO_FLUXO_INVALIDA');
    this.name = 'ErroExecucaoFluxoInvalida';
  }
}

export class ErroTransicaoExecucaoFluxoInvalida extends Error {
  public constructor() {
    super('TRANSICAO_EXECUCAO_FLUXO_INVALIDA');
    this.name = 'ErroTransicaoExecucaoFluxoInvalida';
  }
}

export class ErroExecucaoFluxoTerminal extends Error {
  public constructor() {
    super('EXECUCAO_FLUXO_TERMINAL');
    this.name = 'ErroExecucaoFluxoTerminal';
  }
}

export class ErroConflitoExecucaoFluxo extends Error {
  public constructor() {
    super('CONFLITO_EXECUCAO_FLUXO');
    this.name = 'ErroConflitoExecucaoFluxo';
  }
}

export class ErroInicioExecucaoFluxoNegado extends Error {
  public constructor() {
    super('INICIO_EXECUCAO_FLUXO_NEGADO');
    this.name = 'ErroInicioExecucaoFluxoNegado';
  }
}
