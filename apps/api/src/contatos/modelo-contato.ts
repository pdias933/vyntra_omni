export type EstadoContato = 'NORMAL' | 'BLOQUEADO';

export interface ContatoPersistido {
  readonly id: string;
  readonly nomeExibicao?: string;
  readonly estado: EstadoContato;
  readonly ultimaInteracaoEm?: Date;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface IdentidadeWhatsAppPersistida {
  readonly id: string;
  readonly contatoId: string;
  readonly portfolioEmpresarialExternoId: string;
  readonly identificadorExternoEstavel: string;
  readonly nomeUsuario?: string;
  readonly telefoneE164?: string;
  readonly nomePerfil?: string;
  readonly contaWhatsAppUltimaObservacaoId: string;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;
}

export interface EntradaObservacaoIdentidadeWhatsApp {
  readonly contaWhatsAppId: string;
  readonly identificadorExternoEstavel: string;
  readonly nomeUsuario?: string;
  readonly telefoneE164?: string;
  readonly nomePerfil?: string;
}

export interface ResultadoResolucaoIdentidadeWhatsApp {
  readonly contato: ContatoPersistido;
  readonly identidade: IdentidadeWhatsAppPersistida;
  readonly criada: boolean;
}
