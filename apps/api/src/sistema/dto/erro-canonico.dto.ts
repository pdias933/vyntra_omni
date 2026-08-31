import { ApiProperty } from '@nestjs/swagger';

export class ErroCanonicoDto {
  @ApiProperty({ example: 'RECURSO_NAO_ENCONTRADO' })
  public readonly codigo: string;

  @ApiProperty({ example: 'O recurso solicitado não foi encontrado.' })
  public readonly mensagem: string;

  public constructor(codigo: string, mensagem: string) {
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}
