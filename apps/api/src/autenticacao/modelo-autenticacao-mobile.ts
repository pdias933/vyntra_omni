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
  readonly codigoMfa?: string;
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

export interface DispositivoMobileListado {
  readonly id: string;
  readonly plataforma: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo: string;
  readonly ultimoAcessoEm: Date;
  readonly criadoEm: Date;
}

export interface ResumoDispositivoMobile extends DispositivoMobileListado {
  readonly atual: boolean;
}

export interface SessaoMobilePersistida {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly usuarioAtivo: boolean;
  readonly dispositivoId: string;
  readonly dispositivoAtivo: boolean;
  readonly identificadorInstalacaoHash: string;
  readonly plataforma: PlataformaMobile;
  readonly versaoAplicativo: string;
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
  readonly dispositivoSubstituido: boolean;
}

export type ResultadoEmissaoSessaoMobile =
  | { readonly dispositivoNaoConfiavel: true }
  | {
      readonly dispositivoNaoConfiavel: false;
      readonly sessao: SessaoMobileEmitida;
    };

export interface SessaoMobileAutenticada {
  readonly contexto: ContextoSessaoAutorizacao;
  readonly dispositivoId: string;
  readonly identificadorInstalacaoHash: string;
  readonly nomeExibicao: string;
  readonly refreshExpiraEm: Date;
}

export interface RegistroTentativaLoginMobile {
  readonly id: string;
  readonly identificadorHash: string;
  readonly enderecoIp: string;
  readonly identificadorInstalacaoHash: string;
  readonly resultado: 'BLOQUEADA' | 'FALHA' | 'SUCESSO';
  readonly criadoEm: Date;
}
