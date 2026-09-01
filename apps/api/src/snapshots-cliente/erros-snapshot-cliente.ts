export class ErroSnapshotClienteInvalido extends Error {
  public constructor() {
    super('SNAPSHOT_CLIENTE_INVALIDO');
    this.name = 'ErroSnapshotClienteInvalido';
  }
}

export class ErroVinculoSnapshotIndisponivel extends Error {
  public constructor() {
    super('VINCULO_SNAPSHOT_INDISPONIVEL');
    this.name = 'ErroVinculoSnapshotIndisponivel';
  }
}

export class ErroConflitoSnapshotCliente extends Error {
  public constructor() {
    super('CONFLITO_SNAPSHOT_CLIENTE');
    this.name = 'ErroConflitoSnapshotCliente';
  }
}
