import type { TipoNoFluxo } from './modelo-validacao-fluxo.js';

export const CENARIOS_SIMULACAO_FLUXO = [
  'CAMINHO_FELIZ',
  'CAMINHO_ALTERNATIVO',
  'CONTATO_NAO_IDENTIFICADO',
  'ERP_INDISPONIVEL',
  'TIMEOUT',
  'FORA_DO_HORARIO',
  'CANAL_LIMITADO',
] as const;

export type CenarioSimulacaoFluxo =
  (typeof CENARIOS_SIMULACAO_FLUXO)[number];

export interface ContextoFicticioSimulacaoFluxo {
  readonly contato: 'Cliente fictício';
  readonly contrato: 'CONTRATO-DEMO-001';
  readonly documento: '***.***.***-**';
  readonly telefone: '+55 00 00000-0000';
}

export interface PassoSimulacaoFluxo {
  readonly ordem: number;
  readonly noId: string;
  readonly tipoNo: TipoNoFluxo;
  readonly estado: 'CONCLUIDO' | 'INTERROMPIDO';
  readonly saida?: string;
  readonly descricao: string;
}

export interface ItemPreviaSimulacaoFluxo {
  readonly ordemPasso: number;
  readonly origem: 'CLIENTE_FICTICIO' | 'EMPRESA' | 'SISTEMA';
  readonly conteudo: string;
}

export interface ResultadoSimulacaoFluxo {
  readonly cenario: CenarioSimulacaoFluxo;
  readonly estado: 'CONCLUIDA' | 'INTERROMPIDA' | 'LIMITE_ATINGIDO';
  readonly codigoFinal: string;
  readonly contextoFicticio: ContextoFicticioSimulacaoFluxo;
  readonly efeitosReaisExecutados: false;
  readonly passos: readonly PassoSimulacaoFluxo[];
  readonly previa: readonly ItemPreviaSimulacaoFluxo[];
}
