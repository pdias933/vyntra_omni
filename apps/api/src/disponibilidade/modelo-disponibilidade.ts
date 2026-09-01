export type EstadoDisponibilidadeUsuario = 'DISPONIVEL' | 'INDISPONIVEL';

export interface DisponibilidadeUsuarioPersistida {
  readonly usuarioId: string;
  readonly estado: EstadoDisponibilidadeUsuario;
  readonly alteradoEm: Date;
  readonly alteradoPorUsuarioId: string;
  readonly versao: number;
}

