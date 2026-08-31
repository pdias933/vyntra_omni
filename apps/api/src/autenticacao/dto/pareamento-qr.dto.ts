import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

import type {
  EstadoPareamentoQrMobile,
  PareamentoQrGerado,
  ResgatePareamentoQrEmitido,
  ResumoPareamentoQrWeb,
} from '../modelo-pareamento-qr.js';

const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;
const VERSAO_APLICATIVO = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/u;

export class EntradaResgatePareamentoQrDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(SEGREDO_OPACO)
  public readonly token_qr!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly identificador_instalacao!: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(SEGREDO_OPACO)
  public readonly segredo_vinculo!: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  public readonly plataforma!: 'ANDROID' | 'IOS';

  @ApiProperty({ maxLength: 120, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  public readonly modelo_sanitizado?: string;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @Matches(VERSAO_APLICATIVO)
  public readonly versao_aplicativo!: string;
}

export class EntradaComprovantePareamentoQrDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly pareamento_id!: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(SEGREDO_OPACO)
  public readonly comprovante_resgate!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly identificador_instalacao!: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(SEGREDO_OPACO)
  public readonly segredo_vinculo!: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  public readonly plataforma!: 'ANDROID' | 'IOS';

  @ApiProperty({ maxLength: 120, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  public readonly modelo_sanitizado?: string;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @Matches(VERSAO_APLICATIVO)
  public readonly versao_aplicativo!: string;
}

export class PareamentoQrGeradoDto {
  @ApiProperty({ format: 'uuid' })
  public readonly pareamento_id: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  public readonly token_qr: string;

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  public constructor(pareamento: PareamentoQrGerado) {
    this.pareamento_id = pareamento.id;
    this.token_qr = pareamento.tokenQr;
    this.expira_em = pareamento.expiraEm.toISOString();
  }
}

export class ResumoPareamentoQrWebDto {
  @ApiProperty({ format: 'uuid' })
  public readonly pareamento_id: string;

  @ApiProperty({
    enum: ['AGUARDANDO_RESGATE', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADO'],
  })
  public readonly estado:
    | 'AGUARDANDO_RESGATE'
    | 'AGUARDANDO_CONFIRMACAO'
    | 'CONFIRMADO';

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID'], required: false })
  public readonly plataforma?: 'ANDROID' | 'IOS';

  @ApiProperty({ required: false })
  public readonly modelo_sanitizado?: string;

  @ApiProperty({ required: false })
  public readonly versao_aplicativo?: string;

  public constructor(pareamento: ResumoPareamentoQrWeb) {
    this.pareamento_id = pareamento.id;
    this.estado = pareamento.estado;
    this.expira_em = pareamento.expiraEm.toISOString();
    if (pareamento.plataforma !== undefined) {
      this.plataforma = pareamento.plataforma;
    }
    if (pareamento.modeloSanitizado !== undefined) {
      this.modelo_sanitizado = pareamento.modeloSanitizado;
    }
    if (pareamento.versaoAplicativo !== undefined) {
      this.versao_aplicativo = pareamento.versaoAplicativo;
    }
  }
}

export class ResgatePareamentoQrDto {
  @ApiProperty({ format: 'uuid' })
  public readonly pareamento_id: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  public readonly comprovante_resgate: string;

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  public constructor(resgate: ResgatePareamentoQrEmitido) {
    this.pareamento_id = resgate.id;
    this.comprovante_resgate = resgate.comprovanteResgate;
    this.expira_em = resgate.expiraEm.toISOString();
  }
}

export class EstadoPareamentoQrMobileDto {
  @ApiProperty({ enum: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADO'] })
  public readonly estado: 'AGUARDANDO_CONFIRMACAO' | 'CONFIRMADO';

  @ApiProperty({ format: 'date-time' })
  public readonly expira_em: string;

  public constructor(estado: EstadoPareamentoQrMobile) {
    this.estado = estado.estado;
    this.expira_em = estado.expiraEm.toISOString();
  }
}
