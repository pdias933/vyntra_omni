import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class EntradaRefreshMobileDto {
  @ApiProperty({ maxLength: 43, minLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  public readonly token_refresh!: string;
}
