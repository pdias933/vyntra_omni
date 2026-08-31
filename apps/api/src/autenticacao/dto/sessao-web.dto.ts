import { ApiProperty } from '@nestjs/swagger';

export class SessaoWebDto {
  @ApiProperty({ format: 'uuid' })
  public readonly sessao_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly usuario_id: string;

  @ApiProperty({ example: 'Maria Silva' })
  public readonly nome_exibicao: string;

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  public constructor(
    sessaoId: string,
    usuarioId: string,
    nomeExibicao: string,
    expiraEm: Date,
  ) {
    this.sessao_id = sessaoId;
    this.usuario_id = usuarioId;
    this.nome_exibicao = nomeExibicao;
    this.expira_em = expiraEm.toISOString();
  }
}
