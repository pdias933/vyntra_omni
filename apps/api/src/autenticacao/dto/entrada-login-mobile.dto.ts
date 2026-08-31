import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class EntradaLoginMobileDto {
  @ApiProperty({ example: 'maria.silva', maxLength: 120, minLength: 3 })
  @IsString()
  @Length(3, 120)
  public readonly identificador!: string;

  @ApiProperty({ maxLength: 128, minLength: 12 })
  @IsString()
  @Length(12, 128)
  public readonly senha!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly identificador_instalacao!: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  public readonly segredo_vinculo!: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  public readonly plataforma!: 'ANDROID' | 'IOS';

  @ApiProperty({ maxLength: 120, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  public readonly modelo_sanitizado?: string;

  @ApiProperty({ example: '1.0.0', maxLength: 40 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/u)
  public readonly versao_aplicativo!: string;
}
