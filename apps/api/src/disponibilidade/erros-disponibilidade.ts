export class ErroDisponibilidadeInvalida extends Error {
  public constructor() {
    super('A disponibilidade informada é inválida.');
    this.name = 'ErroDisponibilidadeInvalida';
  }
}

export class ErroUsuarioDisponibilidadeIndisponivel extends Error {
  public constructor() {
    super('O usuário solicitado não está disponível.');
    this.name = 'ErroUsuarioDisponibilidadeIndisponivel';
  }
}

export class ErroConflitoDisponibilidade extends Error {
  public constructor() {
    super('A disponibilidade foi alterada por outra operação.');
    this.name = 'ErroConflitoDisponibilidade';
  }
}

