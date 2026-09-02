import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

import {
  MOTIVOS_REVISAO_PENDENCIA_TEXTO,
  type MotivoRevisaoPendenciaTexto,
} from '../mensagens/modelo-mensagem.js';
import type { MensagemCriadaWeb } from '../console-web/modelo-console-web.js';
import { MensagemCriadaWebDto } from '../console-web/dto/console-web.dto.js';

export class EntradaReconciliarTextoMobileDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly mensagem_cliente_id!: string;

  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @Length(1, 4096)
  public readonly texto!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  public readonly criada_dispositivo_em!: string;

  @ApiProperty({ pattern: '^(0|[1-9][0-9]{0,18})$' })
  @Matches(/^(0|[1-9][0-9]{0,18})$/u)
  public readonly sequencia_observada!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_atribuicao_observada!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_estado_observada!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_contexto_observada!: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  public readonly janela_expira_em_observada!: string;
}

export class ResultadoReconciliacaoTextoMobileDto {
  @ApiProperty({ enum: ['ENVIADA_PARA_FILA', 'REVISAO_NECESSARIA'] })
  public readonly estado: 'ENVIADA_PARA_FILA' | 'REVISAO_NECESSARIA';

  @ApiProperty({
    enum: MOTIVOS_REVISAO_PENDENCIA_TEXTO,
    isArray: true,
  })
  public readonly motivos: readonly MotivoRevisaoPendenciaTexto[];

  @ApiProperty({ required: false, type: MensagemCriadaWebDto })
  public readonly mensagem?: MensagemCriadaWebDto;

  public constructor(resultado:
    | {
        readonly estado: 'ENVIADA_PARA_FILA';
        readonly mensagem: MensagemCriadaWeb;
      }
    | {
        readonly estado: 'REVISAO_NECESSARIA';
        readonly motivos: readonly MotivoRevisaoPendenciaTexto[];
      }) {
    this.estado = resultado.estado;
    this.motivos =
      resultado.estado === 'REVISAO_NECESSARIA' ? resultado.motivos : [];
    if (resultado.estado === 'ENVIADA_PARA_FILA') {
      this.mensagem = new MensagemCriadaWebDto(resultado.mensagem);
    }
  }
}
