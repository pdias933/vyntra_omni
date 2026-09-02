import type { ResumoMetricasHttp } from './registro-metricas.js';

export type CodigoComponenteObservado =
  | 'API'
  | 'POSTGRESQL'
  | 'REDIS'
  | 'STORAGE'
  | 'CAIXA_SAIDA'
  | 'OPERACOES_RECUPERAVEIS'
  | 'MOTOR_FLUXOS';

export interface MetricaBacklog {
  readonly idadeItemMaisAntigoSegundos: number;
  readonly quantidade: number;
}

export interface AlertaOperacional {
  readonly codigo:
    | 'CAIXA_SAIDA_ATRASADA'
    | 'DEPENDENCIA_INDISPONIVEL'
    | 'FLUXO_ATRASADO'
    | 'OPERACAO_RECUPERAVEL_ATRASADA';
  readonly componente: CodigoComponenteObservado;
  readonly limite: number;
  readonly runbook: string;
  readonly severidade: 'ALTA' | 'CRITICA' | 'MEDIA';
  readonly unidade: 'ESTADO' | 'SEGUNDOS';
  readonly valorAtual: number;
}

export interface PainelObservabilidade {
  readonly alertas: readonly AlertaOperacional[];
  readonly coletadoEm: Date;
  readonly metricas: {
    readonly caixaSaida: MetricaBacklog;
    readonly fluxos: MetricaBacklog;
    readonly http: ResumoMetricasHttp;
    readonly operacoesRecuperaveis: MetricaBacklog;
  };
  readonly versaoRegras: 1;
}
