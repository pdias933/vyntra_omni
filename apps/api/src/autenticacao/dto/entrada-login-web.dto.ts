import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class EntradaLoginWebDto {
  @ApiProperty({
    default: false,
    description: 'Confirma a substituição da sessão web ativa mais antiga quando o limite for alcançado.',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  public readonly confirmar_revogacao_sessao_mais_antiga?: boolean;

  @ApiProperty({ example: 'maria.silva', maxLength: 120, minLength: 3 })
  @IsString()
  @Length(3, 120)
  public readonly identificador!: string;

  @ApiProperty({ example: 'uma senha longa e privada', maxLength: 128, minLength: 12 })
  @IsString()
  @Length(12, 128)
  public readonly senha!: string;
}
