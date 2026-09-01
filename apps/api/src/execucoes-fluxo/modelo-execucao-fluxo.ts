import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const ESTADOS_EXECUCAO_FLUXO = [
  'EXECUTANDO',
  'AGUARDANDO_RESPOSTA',
  'AGUARDANDO_SISTEMA',
  'AGUARDANDO_ATENDENTE',
  'SUSPENSA_POR_ATENDIMENTO_HUMANO',
  'CONCLUIDA',
  'FALHOU',
  'CANCELADA',
] as const;

export const ESTADOS_TERMINAIS_EXECUCAO_FLUXO = [
  'SUSPENSA_POR_ATENDIMENTO_HUMANO',
  'CONCLUIDA',
  'FALHOU',
  'CANCELADA',
] as const;

export type EstadoExecucaoFluxo = (typeof ESTADOS_EXECUCAO_FLUXO)[number];
export type EstadoTerminalExecucaoFluxo =
  (typeof ESTADOS_TERMINAIS_EXECUCAO_FLUXO)[number];

export interface ExecucaoFluxoPersistida {
  readonly id: string;
  readonly atendimentoId: string;
  readonly fluxoId: string;
  readonly versaoFluxoId: string;
  readonly estado: EstadoExecucaoFluxo;
  readonly noAtualId: string;
  readonly contextoProtegido: ObjetoJsonProtegido;
  readonly retomarEm?: Date | undefined;
  readonly revisao: number;
  readonly codigoFinalizacao?: string | undefined;
  readonly iniciadaEm: Date;
  readonly atualizadaEm: Date;
  readonly finalizadaEm?: Date | undefined;
}

export type ComandoTransicaoExecucaoFluxo =
  | { readonly tipo: 'AGUARDAR_RESPOSTA' }
  | { readonly tipo: 'AGUARDAR_SISTEMA' }
  | { readonly tipo: 'AGUARDAR_ATENDENTE' }
  | { readonly tipo: 'RETOMAR' }
  | { readonly tipo: 'CONCLUIR' }
  | { readonly tipo: 'FALHAR'; readonly codigo: string }
  | { readonly tipo: 'CANCELAR'; readonly codigo: string }
  | { readonly tipo: 'SUSPENDER_POR_ATENDIMENTO_HUMANO' };

export interface EntradaInicioExecucaoFluxo {
  readonly atendimentoId: unknown;
  readonly fluxoId: unknown;
}

export interface EntradaTransicaoExecucaoFluxo {
  readonly execucaoFluxoId: unknown;
  readonly revisaoEsperada: unknown;
  readonly comando: unknown;
}

export interface EntradaAgendamentoExecucaoFluxo {
  readonly execucaoFluxoId: unknown;
  readonly revisaoEsperada: unknown;
  readonly retomarEm: unknown;
}

export interface EntradaAvancoNoExecucaoFluxo {
  readonly execucaoFluxoId: unknown;
  readonly revisaoEsperada: unknown;
  readonly proximoNoId: unknown;
  readonly contextoProtegido?: ObjetoJsonProtegido | undefined;
}
