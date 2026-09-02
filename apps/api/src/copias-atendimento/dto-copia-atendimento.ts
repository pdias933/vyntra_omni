import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsString, Matches } from 'class-validator';

import type { CopiaAtendimentoEmitida } from './modelo-copia-atendimento.js';

export class EntradaCriarCopiaAtendimentoDto {
  @ApiProperty({ enum: [true] })
  @Equals(true)
  public readonly confirmacao_explicita!: true;
}

export class EntradaBaixarCopiaAtendimentoDto {
  @ApiProperty({ description: 'Token opaco de uso único.', minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  public readonly token!: string;
}

export class CopiaAtendimentoEmitidaDto {
  @ApiProperty({ format: 'date-time' }) public readonly expira_em: string;
  @ApiProperty() public readonly nome_arquivo: string;
  @ApiProperty({ minLength: 43, maxLength: 43 }) public readonly token: string;

  public constructor(copia: CopiaAtendimentoEmitida) {
    this.expira_em = copia.expiraEm.toISOString();
    this.nome_arquivo = copia.nomeArquivo;
    this.token = copia.token;
  }
}
