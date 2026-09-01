export type TipoVinculoCliente = 'VERIFICADO' | 'MANUAL' | 'TEMPORARIO';
export type OrigemContextoAtendimento =
  | 'IDENTIFICACAO'
  | 'USUARIO'
  | 'FLUXO'
  | 'SISTEMA';

export interface AlvoContextoAtendimento {
  readonly contatoId: string;
  readonly vinculoClienteId: string;
  readonly vinculoContratoId?: string;
  readonly clienteExternoId: string;
  readonly contratoExternoId?: string;
}

export interface ContextoAtendimentoPersistido extends AlvoContextoAtendimento {
  readonly atendimentoId: string;
  readonly origem: OrigemContextoAtendimento;
  readonly versao: number;
  readonly alteradoEm: Date;
  readonly alteradoPorUsuarioId?: string;
}

export interface EntradaInicializacaoContextoAtendimento {
  readonly atendimentoId: string;
  readonly contatoId: string;
  readonly vinculoClienteId: string;
  readonly vinculoContratoId?: string;
  readonly origem: Exclude<OrigemContextoAtendimento, 'USUARIO'>;
}

export interface EntradaAlteracaoContextoAtendimento {
  readonly atendimentoId: string;
  readonly vinculoClienteId: string;
  readonly vinculoContratoId?: string;
  readonly versaoEsperada: number;
}
