import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

import type { ContextoOperacional, DestinoTransferencia } from './servico-operacao-atendimentos.js';

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
  @ApiProperty() public readonly pode_transferir: boolean;

  public constructor(contexto: ContextoOperacional) {
    this.atendimento_id = contexto.atendimentoId;
    this.estado = contexto.estado;
    this.fila_id = contexto.filaId;
    this.responsavel_id = contexto.responsavelId;
    this.responsavel_nome = contexto.responsavelNome;
    this.versao_atribuicao = contexto.versaoAtribuicao;
    this.pode_resgatar = contexto.podeResgatar;
    this.pode_transferir = contexto.podeTransferir;
  }
}

export class OperacaoConfirmadaDto {
  @ApiProperty({ enum: ['CONFIRMADA'] }) public readonly situacao = 'CONFIRMADA';
}

export class EntradaTransferenciaAtendimentoDto extends EntradaResgateAtendimentoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public fila_destino_id!: string;
  @ApiProperty({ format: 'uuid', required: false }) @IsOptional() @IsUUID() public usuario_destino_id?: string;
  @ApiProperty({ enum: [true] }) @Equals(true) public confirmacao_explicita!: true;
}

export class DestinoTransferenciaDto {
  @ApiProperty({ format: 'uuid' }) public readonly fila_id: string;
  @ApiProperty() public readonly fila_nome: string;
  @ApiProperty({ required: false, format: 'uuid' }) public readonly usuario_id?: string;
  @ApiProperty({ required: false }) public readonly usuario_nome?: string;
  public constructor(destino: DestinoTransferencia) {
    this.fila_id = destino.filaId;
    this.fila_nome = destino.filaNome;
    if (destino.usuarioId !== undefined) this.usuario_id = destino.usuarioId;
    if (destino.usuarioNome !== undefined) this.usuario_nome = destino.usuarioNome;
  }
}

export class DisponibilidadePropriaDto {
  @ApiProperty({ enum: ['DISPONIVEL', 'INDISPONIVEL'] }) public readonly estado: string;
  @ApiProperty() public readonly versao: number;
  public constructor(atual: { readonly estado: string; readonly versao: number }) { this.estado = atual.estado; this.versao = atual.versao; }
}

export class EntradaDisponibilidadePropriaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public chave_idempotencia!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) public versao_esperada!: number;
  @ApiProperty({ enum: ['DISPONIVEL', 'INDISPONIVEL'] }) @IsIn(['DISPONIVEL', 'INDISPONIVEL']) public estado!: 'DISPONIVEL' | 'INDISPONIVEL';
}
