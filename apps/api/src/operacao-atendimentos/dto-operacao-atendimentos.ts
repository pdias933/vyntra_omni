import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

import type { ContextoOperacional } from './servico-operacao-atendimentos.js';

export class EntradaResgateAtendimentoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public chave_idempotencia!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public versao_atribuicao_esperada!: number;
}

export class ContextoOperacionalDto {
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty() public readonly estado: string;
  @ApiProperty({ format: 'uuid' }) public readonly fila_id: string;
  @ApiProperty({ type: String, nullable: true }) public readonly responsavel_id: string | null;
  @ApiProperty({ type: String, nullable: true }) public readonly responsavel_nome: string | null;
  @ApiProperty() public readonly versao_atribuicao: number;
  @ApiProperty() public readonly pode_resgatar: boolean;

  public constructor(contexto: ContextoOperacional) {
    this.atendimento_id = contexto.atendimentoId;
    this.estado = contexto.estado;
    this.fila_id = contexto.filaId;
    this.responsavel_id = contexto.responsavelId;
    this.responsavel_nome = contexto.responsavelNome;
    this.versao_atribuicao = contexto.versaoAtribuicao;
    this.pode_resgatar = contexto.podeResgatar;
  }
}

export class OperacaoConfirmadaDto {
  @ApiProperty({ enum: ['CONFIRMADA'] }) public readonly situacao = 'CONFIRMADA';
}
