import type { CodigoPermissaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';

export interface PerfilAdministracaoUsuario {
  readonly id: string;
  readonly nome: string;
  readonly papelBase: string;
  readonly permissoes: readonly { readonly codigo: CodigoPermissaoAutorizacao; readonly efeito: 'CONCEDER' | 'NEGAR' }[];
}

export interface FilaAdministracaoUsuario { readonly id: string; readonly nome: string }

export interface ResumoAdministracaoUsuario {
  readonly id: string;
  readonly nomeExibicao: string;
  readonly estado: string;
  readonly perfil?: { readonly id: string; readonly nome: string; readonly papelBase: string };
  readonly filas: readonly FilaAdministracaoUsuario[];
  readonly sessoesWebAtivas: number;
  readonly dispositivosMobileAtivos: number;
  readonly versaoPermissoes: number;
}

export interface ItemAuditoriaAdministracaoUsuario {
  readonly id: string;
  readonly acao: string;
  readonly criadoEm: Date;
  readonly entidadeId?: string;
  readonly usuarioAtorId?: string;
}

export interface PainelAdministracaoUsuarios {
  readonly usuarios: readonly ResumoAdministracaoUsuario[];
  readonly perfis: readonly PerfilAdministracaoUsuario[];
  readonly filas: readonly FilaAdministracaoUsuario[];
  readonly auditoriaRecente: readonly ItemAuditoriaAdministracaoUsuario[];
}

export interface EntradaAlteracaoAcessoUsuario {
  readonly perfilId: string;
  readonly filaIds: readonly string[];
  readonly versaoEsperada: number;
}
