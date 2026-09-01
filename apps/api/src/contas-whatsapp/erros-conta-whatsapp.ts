export class ErroContaWhatsAppInvalida extends Error {
  public readonly codigo = 'CONTA_WHATSAPP_INVALIDA';

  public constructor() {
    super('CONTA_WHATSAPP_INVALIDA');
    this.name = 'ErroContaWhatsAppInvalida';
  }
}

export class ErroContaWhatsAppDuplicada extends Error {
  public readonly codigo = 'CONTA_WHATSAPP_DUPLICADA';

  public constructor() {
    super('CONTA_WHATSAPP_DUPLICADA');
    this.name = 'ErroContaWhatsAppDuplicada';
  }
}
