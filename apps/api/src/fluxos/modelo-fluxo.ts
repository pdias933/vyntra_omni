import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const TIPOS_FLUXO = [
  'ATENDIMENTO',
  'AUTENTICACAO',
  'FINANCEIRO',
  'COMERCIAL',
  'SUPORTE',
  'OUTRO',
] as const;

export const ESTADOS_VERSAO_FLUXO = [
  'RASCUNHO',
  'EM_TESTE',
  'PUBLICADA',
  'ARQUIVADA',
] as const;

export type TipoFluxo = (typeof TIPOS_FLUXO)[number];
export type EstadoVersaoFluxo = (typeof ESTADOS_VERSAO_FLUXO)[number];
export type DefinicaoFluxo = ObjetoJsonProtegido;

export interface FluxoPersistido {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly descricao?: string;
  readonly tipo: TipoFluxo;
  readonly ativo: boolean;
  readonly versaoPublicadaId?: string;
  readonly revisao: number;
  readonly criadoPorUsuarioId: string;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

export interface VersaoFluxoPersistida {
  readonly id: string;
  readonly fluxoId: string;
  readonly numeroVersao: number;
  readonly estado: EstadoVersaoFluxo;
  readonly versaoSchemaDefinicao: number;
  readonly definicao: DefinicaoFluxo;
  readonly revisao: number;
  readonly criadaPorUsuarioId: string;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;
  readonly publicadaPorUsuarioId?: string;
  readonly publicadaEm?: Date;
}

export interface FluxoComVersaoInicial {
  readonly fluxo: FluxoPersistido;
  readonly versao: VersaoFluxoPersistida;
}

export interface EntradaCriacaoFluxo {
  readonly nome: unknown;
  readonly descricao?: unknown;
  readonly tipo: unknown;
  readonly definicaoInicial: unknown;
  readonly versaoSchemaDefinicao?: unknown;
}

export interface EntradaNovaVersaoFluxo {
  readonly fluxoId: unknown;
  readonly definicao: unknown;
  readonly versaoSchemaDefinicao?: unknown;
}

export interface EntradaAlteracaoVersaoFluxo {
  readonly versaoFluxoId: unknown;
  readonly revisaoEsperada: unknown;
  readonly definicao: unknown;
  readonly versaoSchemaDefinicao?: unknown;
}
