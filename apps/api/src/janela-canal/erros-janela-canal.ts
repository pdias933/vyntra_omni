export class ErroEntradaJanelaCanalInvalida extends Error {
  public constructor() {
    super('ENTRADA_JANELA_CANAL_INVALIDA');
  }
}

export class ErroAlvoJanelaCanalInvalido extends Error {
  public constructor() {
    super('ALVO_JANELA_CANAL_INVALIDO');
  }
}

export class ErroTextoLivreForaJanela extends Error {
  public constructor() {
    super('TEXTO_LIVRE_FORA_DA_JANELA');
  }
}
