import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

import type {
  ComponenteSaudeAdministrativa,
  OperacaoSaudeAdministrativa,
  PainelSaudeAdministrativa,
  ResumoFalhasSaudeAdministrativa,
} from '../modelo-saude-administrativa.js';

export class EntradaReprocessamentoOperacaoDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_esperada!: number;
}

export class ComponenteSaudeAdministrativaDto {
  @ApiProperty({ enum: ['API', 'POSTGRESQL', 'REDIS', 'STORAGE'] })
  public readonly codigo: ComponenteSaudeAdministrativa['codigo'];

  @ApiProperty({ enum: ['INDISPONIVEL', 'NAO_CONFIGURADO', 'OPERACIONAL'] })
  public readonly estado: ComponenteSaudeAdministrativa['estado'];

  public constructor(componente: ComponenteSaudeAdministrativa) {
    this.codigo = componente.codigo;
    this.estado = componente.estado;
  }
}

export class ResumoFalhasSaudeAdministrativaDto {
  @ApiProperty({ minimum: 0 })
  public readonly aguardando_nova_tentativa: number;

  @ApiProperty({ minimum: 0 })
  public readonly resultados_incertos: number;

  @ApiProperty({ minimum: 0 })
  public readonly falhas_definitivas: number;

  @ApiProperty({ minimum: 0 })
  public readonly itens_caixa_saida_pendentes: number;

  public constructor(resumo: ResumoFalhasSaudeAdministrativa) {
    this.aguardando_nova_tentativa = resumo.aguardandoNovaTentativa;
    this.resultados_incertos = resumo.resultadosIncertos;
    this.falhas_definitivas = resumo.falhasDefinitivas;
    this.itens_caixa_saida_pendentes = resumo.itensCaixaSaidaPendentes;
  }
}

export class OperacaoSaudeAdministrativaDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly tipo: string;

  @ApiProperty({
    enum: [
      'PENDENTE',
      'EM_EXECUCAO',
      'AGUARDANDO_NOVA_TENTATIVA',
      'RESULTADO_INCERTO',
      'EM_RECONCILIACAO',
      'CONCLUIDA',
      'FALHA_DEFINITIVA',
    ],
  })
  public readonly estado: OperacaoSaudeAdministrativa['estado'];

  @ApiProperty({ minimum: 0 })
  public readonly tentativas: number;

  @ApiProperty({ minimum: 0 })
  public readonly versao: number;

  @ApiProperty({ format: 'date-time' })
  public readonly atualizado_em: string;

  @ApiProperty({ format: 'date-time', required: false })
  public readonly proxima_acao_em?: string;

  @ApiProperty({ required: false })
  public readonly codigo_ultimo_erro?: string;

  @ApiProperty()
  public readonly pode_reprocessar: boolean;

  public constructor(operacao: OperacaoSaudeAdministrativa) {
    this.id = operacao.id;
    this.tipo = operacao.tipo;
    this.estado = operacao.estado;
    this.tentativas = operacao.tentativas;
    this.versao = operacao.versao;
    this.atualizado_em = operacao.atualizadoEm.toISOString();
    this.pode_reprocessar = operacao.podeReprocessar;
    if (operacao.proximaAcaoEm !== undefined) {
      this.proxima_acao_em = operacao.proximaAcaoEm.toISOString();
    }
    if (operacao.codigoUltimoErro !== undefined) {
      this.codigo_ultimo_erro = operacao.codigoUltimoErro;
    }
  }
}

export class PainelSaudeAdministrativaDto {
  @ApiProperty({ type: [ComponenteSaudeAdministrativaDto] })
  public readonly componentes: readonly ComponenteSaudeAdministrativaDto[];

  @ApiProperty({ type: ResumoFalhasSaudeAdministrativaDto })
  public readonly resumo: ResumoFalhasSaudeAdministrativaDto;

  @ApiProperty({ type: [OperacaoSaudeAdministrativaDto] })
  public readonly operacoes: readonly OperacaoSaudeAdministrativaDto[];

  public constructor(painel: PainelSaudeAdministrativa) {
    this.componentes = painel.componentes.map(
      (componente) => new ComponenteSaudeAdministrativaDto(componente),
    );
    this.resumo = new ResumoFalhasSaudeAdministrativaDto(painel.resumo);
    this.operacoes = painel.operacoes.map(
      (operacao) => new OperacaoSaudeAdministrativaDto(operacao),
    );
  }
}
