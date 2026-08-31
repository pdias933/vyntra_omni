import type {
  AjustePermissaoAutorizacao,
  ContextoSessaoAutorizacao,
  PapelBaseAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';

export type PlataformaMobile = 'ANDROID' | 'IOS';

export interface CredencialLoginMobile {
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly usuarioAtivo: boolean;
  readonly credencialAtiva: boolean;
  readonly senhaHash: string;
  readonly papelBase: PapelBaseAutorizacao | undefined;
  readonly perfilAtivo: boolean;
  readonly ajustes: readonly AjustePermissaoAutorizacao[];
}

export interface EntradaLoginMobile {
  readonly identificador: string;
  readonly senha: string;
  readonly identificadorInstalacao: string;
  readonly segredoVinculo: string;
  readonly plataforma: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo: string;
  readonly enderecoIp: string;
}

export interface EntradaDispositivoMobile {
  readonly identificadorInstalacaoHash: string;
  readonly segredoVinculoHash: string;
  readonly plataforma: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo: string;
}

export interface DispositivoMobilePersistido {
  readonly id: string;
  readonly usuarioId: string;
  readonly segredoVinculoHash: string;
  readonly estado: 'ATIVO' | 'REVOGADO';
}

export interface SessaoMobilePersistida {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly usuarioAtivo: boolean;
  readonly dispositivoId: string;
  readonly dispositivoAtivo: boolean;
  readonly segredoVinculoHash: string;
  readonly tokenAcessoHash: string;
  readonly tokenRefreshHash: string;
  readonly estado: 'ATIVA' | 'REVOGADA';
  readonly acessoExpiraEm: Date;
  readonly refreshExpiraEm: Date;
  readonly versao: number;
}

export interface SessaoMobileEmitida {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly dispositivoId: string;
  readonly tokenAcesso: string;
  readonly tokenRefresh: string;
  readonly acessoExpiraEm: Date;
  readonly refreshExpiraEm: Date;
}

export interface SessaoMobileAutenticada {
  readonly contexto: ContextoSessaoAutorizacao;
  readonly dispositivoId: string;
  readonly nomeExibicao: string;
}

export interface RegistroTentativaLoginMobile {
  readonly id: string;
  readonly identificadorHash: string;
  readonly enderecoIp: string;
  readonly identificadorInstalacaoHash: string;
  readonly resultado: 'BLOQUEADA' | 'FALHA' | 'SUCESSO';
  readonly criadoEm: Date;
}
