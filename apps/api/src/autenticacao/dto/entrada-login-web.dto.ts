import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class EntradaLoginWebDto {
  @ApiProperty({
    description: 'Código TOTP de seis dígitos ou código de recuperação de uso único.',
    example: '123456',
    maxLength: 32,
    minLength: 6,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(6, 32)
  @Matches(/^(?:\d{6}|[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})$/iu)
  public readonly codigo_mfa?: string;

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
