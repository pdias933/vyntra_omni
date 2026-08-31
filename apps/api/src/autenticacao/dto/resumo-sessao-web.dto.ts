import { ApiProperty } from '@nestjs/swagger';

import type { ResumoSessaoWeb } from '../modelo-autenticacao.js';

export class ResumoSessaoWebDto {
  @ApiProperty({ format: 'uuid' })
  public readonly sessao_id: string;

  @ApiProperty()
  public readonly atual: boolean;

  @ApiProperty({ format: 'date-time' })
  public readonly autenticada_em: string;

  @ApiProperty({ format: 'date-time' })
  public readonly ultima_atividade_em: string;

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  public constructor(sessao: ResumoSessaoWeb) {
    this.sessao_id = sessao.id;
    this.atual = sessao.atual;
    this.autenticada_em = sessao.autenticadaEm.toISOString();
    this.ultima_atividade_em = sessao.ultimaAtividadeEm.toISOString();
    this.expira_em = sessao.expiraEm.toISOString();
  }
}
