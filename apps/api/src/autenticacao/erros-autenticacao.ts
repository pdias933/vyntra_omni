export class ErroCredenciaisInvalidas extends Error {
  public readonly codigo = 'CREDENCIAIS_INVALIDAS';

  public constructor() {
    super('CREDENCIAIS_INVALIDAS');
    this.name = 'ErroCredenciaisInvalidas';
  }
}

export class ErroRequisicaoWebNaoConfiavel extends Error {
  public readonly codigo = 'REQUISICAO_WEB_NAO_CONFIAVEL';

  public constructor() {
    super('REQUISICAO_WEB_NAO_CONFIAVEL');
    this.name = 'ErroRequisicaoWebNaoConfiavel';
  }
}

export class ErroLimiteLoginExcedido extends Error {
  public readonly codigo = 'LIMITE_LOGIN_EXCEDIDO';

  public constructor() {
    super('LIMITE_LOGIN_EXCEDIDO');
    this.name = 'ErroLimiteLoginExcedido';
  }
}

export class ErroMfaNecessario extends Error {
  public readonly codigo = 'MFA_NECESSARIO';

  public constructor() {
    super('MFA_NECESSARIO');
    this.name = 'ErroMfaNecessario';
  }
}

export class ErroConfirmacaoRevogacaoSessaoNecessaria extends Error {
  public readonly codigo = 'CONFIRMACAO_REVOGACAO_SESSAO_NECESSARIA';

  public constructor() {
    super('CONFIRMACAO_REVOGACAO_SESSAO_NECESSARIA');
    this.name = 'ErroConfirmacaoRevogacaoSessaoNecessaria';
  }
}

export class ErroDispositivoNaoConfiavel extends Error {
  public readonly codigo = 'DISPOSITIVO_NAO_CONFIAVEL';

  public constructor() {
    super('DISPOSITIVO_NAO_CONFIAVEL');
    this.name = 'ErroDispositivoNaoConfiavel';
  }
}
