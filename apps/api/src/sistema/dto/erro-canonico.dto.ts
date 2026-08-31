import { ApiProperty } from '@nestjs/swagger';

export class ErroCanonicoDto {
  @ApiProperty({ example: 'RECURSO_NAO_ENCONTRADO' })
  public readonly codigo: string;

  @ApiProperty({ example: 'O recurso solicitado não foi encontrado.' })
  public readonly mensagem: string;

  @ApiProperty({
    example: '7fe3cc48-98bc-4b36-9fe7-36de7c1ac882',
  })
  public readonly correlacao_id: string;

  public constructor(codigo: string, mensagem: string, correlacaoId: string) {
    this.codigo = codigo;
    this.mensagem = mensagem;
    this.correlacao_id = correlacaoId;
  }
}
