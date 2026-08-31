import type { PlataformaMobile } from './modelo-autenticacao-mobile.js';

export type EstadoPareamentoQr =
  | 'AGUARDANDO_RESGATE'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONFIRMADO'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'EXPIRADO';

export interface EntradaDispositivoPareamentoQr {
  readonly identificadorInstalacao: string;
  readonly segredoVinculo: string;
  readonly plataforma: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo: string;
}

export interface DispositivoPareamentoQrNormalizado {
  readonly identificadorInstalacaoHash: string;
  readonly segredoVinculoHash: string;
  readonly plataforma: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo: string;
}

export interface PareamentoQrGerado {
  readonly id: string;
  readonly tokenQr: string;
  readonly expiraEm: Date;
}

export interface ResgatePareamentoQrEmitido {
  readonly id: string;
  readonly comprovanteResgate: string;
  readonly expiraEm: Date;
}

export interface EstadoPareamentoQrMobile {
  readonly estado: 'AGUARDANDO_CONFIRMACAO' | 'CONFIRMADO';
  readonly expiraEm: Date;
}

export interface PareamentoQrPersistido {
  readonly id: string;
  readonly usuarioId: string;
  readonly nomeExibicaoUsuario: string;
  readonly usuarioAtivo: boolean;
  readonly sessaoWebId: string;
  readonly sessaoWebAtiva: boolean;
  readonly sessaoWebExpiraEm: Date;
  readonly sessaoWebAutenticadaEm: Date;
  readonly estado: EstadoPareamentoQr;
  readonly expiraEm: Date;
  readonly identificadorInstalacaoHash?: string;
  readonly segredoVinculoHash?: string;
  readonly plataforma?: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo?: string;
  readonly enderecoIpResgate?: string;
  readonly resgatadoEm?: Date;
  readonly confirmadoEm?: Date;
}

export interface ResumoPareamentoQrWeb {
  readonly id: string;
  readonly estado:
    | 'AGUARDANDO_RESGATE'
    | 'AGUARDANDO_CONFIRMACAO'
    | 'CONFIRMADO';
  readonly expiraEm: Date;
  readonly plataforma?: PlataformaMobile;
  readonly modeloSanitizado?: string;
  readonly versaoAplicativo?: string;
}

export interface RegistroTentativaResgateQr {
  readonly id: string;
  readonly enderecoIp: string;
  readonly identificadorInstalacaoHash: string;
  readonly resultado: 'BLOQUEADA' | 'FALHA' | 'SUCESSO';
  readonly criadoEm: Date;
}
