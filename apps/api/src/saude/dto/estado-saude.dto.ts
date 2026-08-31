import { ApiProperty } from '@nestjs/swagger';

export class EstadoSaudeDto {
  @ApiProperty({ enum: ['VIVO', 'PRONTO'], example: 'PRONTO' })
  public readonly estado: 'PRONTO' | 'VIVO';

  public constructor(estado: 'PRONTO' | 'VIVO') {
    this.estado = estado;
  }
}
