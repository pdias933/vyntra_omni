import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class EntradaLoginWebDto {
  @ApiProperty({ example: 'maria.silva', maxLength: 120, minLength: 3 })
  @IsString()
  @Length(3, 120)
  public readonly identificador!: string;

  @ApiProperty({ example: 'uma senha longa e privada', maxLength: 128, minLength: 12 })
  @IsString()
  @Length(12, 128)
  public readonly senha!: string;
}
