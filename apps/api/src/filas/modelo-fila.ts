export type EstadoFilaDominio = 'ATIVA' | 'INATIVA';
export type EstadoAcessoFilaDominio = 'ATIVO' | 'REVOGADO';

export interface FilaPersistida {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly estado: EstadoFilaDominio;
  readonly inativadaEm?: Date | undefined;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface AcessoUsuarioFilaPersistido {
  readonly usuarioId: string;
  readonly filaId: string;
  readonly estado: EstadoAcessoFilaDominio;
  readonly criadoEm: Date;
  readonly revogadoEm?: Date | undefined;
}

export interface EntradaCadastroFila {
  readonly nome: string;
}

