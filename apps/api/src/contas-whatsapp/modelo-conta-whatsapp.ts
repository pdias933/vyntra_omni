export type EstadoContaWhatsApp = 'ATIVA' | 'INATIVA';

export interface ContaWhatsAppPersistida {
  readonly id: string;
  readonly nomeExibicao: string;
  readonly portfolioEmpresarialExternoId: string;
  readonly identificadorCanalExterno: string;
  readonly telefoneExibicaoE164?: string;
  readonly estado: EstadoContaWhatsApp;
  readonly versao: number;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;
}

export interface EntradaCadastroContaWhatsApp {
  readonly nomeExibicao: string;
  readonly portfolioEmpresarialExternoId: string;
  readonly identificadorCanalExterno: string;
  readonly telefoneExibicaoE164?: string;
}

export interface OrigemContaWhatsApp {
  readonly contaWhatsAppId: string;
}
