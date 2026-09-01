import { ApiProperty } from '@nestjs/swagger';

import type {
  LoteSincronizacaoIncremental,
} from '../modelo-sincronizacao.js';
import type {
  PayloadEventoMobile,
  PayloadEventoWeb,
} from '../modelo-projecao-evento.js';

export class LoteSincronizacaoDto {
  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly eventos: readonly (PayloadEventoMobile | PayloadEventoWeb)[];

  @ApiProperty({ example: '123' })
  public readonly sequencia_final: string;

  @ApiProperty()
  public readonly tem_mais: boolean;

  public constructor(lote: LoteSincronizacaoIncremental) {
    this.eventos = lote.eventos;
    this.sequencia_final = lote.sequenciaFinal;
    this.tem_mais = lote.temMais;
  }
}
