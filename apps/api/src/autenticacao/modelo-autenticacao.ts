import type {
  AjustePermissaoAutorizacao,
  ContextoSessaoAutorizacao,
  PapelBaseAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';

export interface CredencialLoginWeb {
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly usuarioAtivo: boolean;
  readonly credencialAtiva: boolean;
  readonly senhaHash: string;
  readonly papelBase: PapelBaseAutorizacao | undefined;
  readonly perfilAtivo: boolean;
  readonly ajustes: readonly AjustePermissaoAutorizacao[];
}

export interface EntradaLoginWeb {
  readonly identificador: string;
  readonly senha: string;
  readonly enderecoIp: string;
  readonly agenteUsuario: string;
  readonly confirmarRevogacaoSessaoMaisAntiga: boolean;
}

export interface SegredosSessaoWeb {
  readonly token: string;
  readonly csrf: string;
}

export interface SessaoWebPersistida {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly tokenHash: string;
  readonly csrfHash: string;
  readonly estado: 'ATIVA' | 'REVOGADA';
  readonly usuarioAtivo: boolean;
  readonly expiraEm: Date;
  readonly autenticadaEm: Date;
  readonly ultimaAtividadeEm: Date;
  readonly versao: number;
}

export interface SessaoWebEmitida extends SegredosSessaoWeb {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicao: string;
  readonly expiraEm: Date;
}

export interface SessaoWebAutenticada {
  readonly contexto: ContextoSessaoAutorizacao;
  readonly nomeExibicao: string;
}

export interface SessaoWebListada {
  readonly id: string;
  readonly autenticadaEm: Date;
  readonly ultimaAtividadeEm: Date;
  readonly expiraEm: Date;
}

export interface ResumoSessaoWeb extends SessaoWebListada {
  readonly atual: boolean;
}

export type ResultadoTentativaLoginWeb = 'BLOQUEADA' | 'FALHA' | 'SUCESSO';

export interface RegistroTentativaLoginWeb {
  readonly id: string;
  readonly identificadorHash: string;
  readonly enderecoIp: string;
  readonly resultado: ResultadoTentativaLoginWeb;
  readonly criadoEm: Date;
}
