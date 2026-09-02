import { ApiProperty } from '@nestjs/swagger';

import type {
  AlertaOperacional,
  MetricaBacklog,
  PainelObservabilidade,
} from './modelo-observabilidade.js';
import type { ResumoMetricasHttp } from './registro-metricas.js';

export class MetricaBacklogDto {
  @ApiProperty({ minimum: 0 })
  public readonly quantidade: number;

  @ApiProperty({ minimum: 0 })
  public readonly idade_item_mais_antigo_segundos: number;

  public constructor(metrica: MetricaBacklog) {
    this.quantidade = metrica.quantidade;
    this.idade_item_mais_antigo_segundos =
      metrica.idadeItemMaisAntigoSegundos;
  }
}

export class MetricaHttpDto {
  @ApiProperty({ minimum: 0 })
  public readonly requisicoes: number;

  @ApiProperty({ minimum: 0 })
  public readonly falhas: number;

  @ApiProperty({ minimum: 0 })
  public readonly duracao_media_ms: number;

  @ApiProperty({ minimum: 0 })
  public readonly duracao_p95_aproximada_ms: number;

  public constructor(metrica: ResumoMetricasHttp) {
    this.requisicoes = metrica.requisicoes;
    this.falhas = metrica.falhas;
    this.duracao_media_ms = metrica.duracaoMediaMs;
    this.duracao_p95_aproximada_ms = metrica.duracaoP95AproximadaMs;
  }
}

export class MetricasObservabilidadeDto {
  @ApiProperty({ type: MetricaHttpDto })
  public readonly http: MetricaHttpDto;

  @ApiProperty({ type: MetricaBacklogDto })
  public readonly caixa_saida: MetricaBacklogDto;

  @ApiProperty({ type: MetricaBacklogDto })
  public readonly operacoes_recuperaveis: MetricaBacklogDto;

  @ApiProperty({ type: MetricaBacklogDto })
  public readonly fluxos: MetricaBacklogDto;

  public constructor(metricas: PainelObservabilidade['metricas']) {
    this.http = new MetricaHttpDto(metricas.http);
    this.caixa_saida = new MetricaBacklogDto(metricas.caixaSaida);
    this.operacoes_recuperaveis = new MetricaBacklogDto(
      metricas.operacoesRecuperaveis,
    );
    this.fluxos = new MetricaBacklogDto(metricas.fluxos);
  }
}

export class AlertaOperacionalDto {
  @ApiProperty({
    enum: [
      'CAIXA_SAIDA_ATRASADA',
      'DEPENDENCIA_INDISPONIVEL',
      'FLUXO_ATRASADO',
      'OPERACAO_RECUPERAVEL_ATRASADA',
    ],
  })
  public readonly codigo: AlertaOperacional['codigo'];

  @ApiProperty({
    enum: [
      'API',
      'POSTGRESQL',
      'REDIS',
      'STORAGE',
      'CAIXA_SAIDA',
      'OPERACOES_RECUPERAVEIS',
      'MOTOR_FLUXOS',
    ],
  })
  public readonly componente: AlertaOperacional['componente'];

  @ApiProperty({ enum: ['ALTA', 'CRITICA', 'MEDIA'] })
  public readonly severidade: AlertaOperacional['severidade'];

  @ApiProperty({ minimum: 0 })
  public readonly valor_atual: number;

  @ApiProperty({ minimum: 0 })
  public readonly limite: number;

  @ApiProperty({ enum: ['ESTADO', 'SEGUNDOS'] })
  public readonly unidade: AlertaOperacional['unidade'];

  @ApiProperty()
  public readonly runbook: string;

  public constructor(alerta: AlertaOperacional) {
    this.codigo = alerta.codigo;
    this.componente = alerta.componente;
    this.severidade = alerta.severidade;
    this.valor_atual = alerta.valorAtual;
    this.limite = alerta.limite;
    this.unidade = alerta.unidade;
    this.runbook = alerta.runbook;
  }
}

export class PainelObservabilidadeDto {
  @ApiProperty({ format: 'date-time' })
  public readonly coletado_em: string;

  @ApiProperty({ enum: [1] })
  public readonly versao_regras: 1;

  @ApiProperty({ type: MetricasObservabilidadeDto })
  public readonly metricas: MetricasObservabilidadeDto;

  @ApiProperty({ type: [AlertaOperacionalDto] })
  public readonly alertas: readonly AlertaOperacionalDto[];

  public constructor(painel: PainelObservabilidade) {
    this.coletado_em = painel.coletadoEm.toISOString();
    this.versao_regras = painel.versaoRegras;
    this.metricas = new MetricasObservabilidadeDto(painel.metricas);
    this.alertas = painel.alertas.map(
      (alerta) => new AlertaOperacionalDto(alerta),
    );
  }
}
