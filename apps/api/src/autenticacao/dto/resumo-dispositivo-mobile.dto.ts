import { ApiProperty } from '@nestjs/swagger';

import type { ResumoDispositivoMobile } from '../modelo-autenticacao-mobile.js';

export class ResumoDispositivoMobileDto {
  @ApiProperty({ format: 'uuid' })
  public readonly dispositivo_id: string;

  @ApiProperty()
  public readonly atual: boolean;

  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  public readonly plataforma: 'ANDROID' | 'IOS';

  @ApiProperty({ required: false })
  public readonly modelo_sanitizado?: string;

  @ApiProperty()
  public readonly versao_aplicativo: string;

  @ApiProperty({ format: 'date-time' })
  public readonly ultimo_acesso_em: string;

  @ApiProperty({ format: 'date-time' })
  public readonly criado_em: string;

  public constructor(dispositivo: ResumoDispositivoMobile) {
    this.dispositivo_id = dispositivo.id;
    this.atual = dispositivo.atual;
    this.plataforma = dispositivo.plataforma;
    if (dispositivo.modeloSanitizado !== undefined) {
      this.modelo_sanitizado = dispositivo.modeloSanitizado;
    }
    this.versao_aplicativo = dispositivo.versaoAplicativo;
    this.ultimo_acesso_em = dispositivo.ultimoAcessoEm.toISOString();
    this.criado_em = dispositivo.criadoEm.toISOString();
  }
}
