import { ApiProperty } from '@nestjs/swagger';

export class InformacoesApiDto {
  @ApiProperty({ example: 'Vyntra Omnichannel' })
  public readonly nome: string;

  @ApiProperty({ example: 'v1' })
  public readonly versao_api: string;

  public constructor(nome: string, versaoApi: string) {
    this.nome = nome;
    this.versao_api = versaoApi;
  }
}
