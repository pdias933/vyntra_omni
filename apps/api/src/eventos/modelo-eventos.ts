import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const CLASSIFICACOES_DADOS_EVENTO = [
  'OPERACIONAL',
  'DADO_PESSOAL',
  'DADO_SENSIVEL',
] as const;

export type ClassificacaoDadosEvento =
  (typeof CLASSIFICACOES_DADOS_EVENTO)[number];

export interface EventoDominio {
  readonly id: string;
  readonly sequenciaEvento: bigint;
  readonly tipo: string;
  readonly entidadeTipo: string;
  readonly entidadeId: string;
  readonly atendimentoId: string | undefined;
  readonly conversaId: string | undefined;
  readonly usuarioAtorId: string | undefined;
  readonly classificacaoDados: ClassificacaoDadosEvento;
  readonly dadosProtegidosMinimizados: ObjetoJsonProtegido;
  readonly criadoEm: Date;
}

export interface EntradaEventoDominio {
  readonly tipo: string;
  readonly entidadeTipo: string;
  readonly entidadeId: string;
  readonly atendimentoId?: string;
  readonly conversaId?: string;
  readonly usuarioAtorId?: string;
  readonly classificacaoDados: ClassificacaoDadosEvento;
  readonly dados?: Readonly<Record<string, unknown>>;
}

export type NovoEventoDominio = Omit<EventoDominio, 'sequenciaEvento'>;

export interface ItemCaixaSaida {
  readonly id: string;
  readonly eventoDominioId: string;
  readonly tipo: string;
  readonly destino: string;
  readonly estado: 'PENDENTE';
  readonly dadosProtegidosMinimizados: ObjetoJsonProtegido;
  readonly disponivelEm: Date;
  readonly criadoEm: Date;
}

export interface EntradaItemCaixaSaida {
  readonly tipo: string;
  readonly destino: string;
  readonly dados?: Readonly<Record<string, unknown>>;
  readonly disponivelEm?: Date;
}
