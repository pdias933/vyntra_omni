import { ApiProperty } from '@nestjs/swagger';

import type {
  SessaoMobileAutenticada,
  SessaoMobileEmitida,
} from '../modelo-autenticacao-mobile.js';

export class SessaoMobileDto {
  @ApiProperty({ format: 'uuid' })
  public readonly sessao_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly usuario_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly dispositivo_id: string;

  @ApiProperty()
  public readonly nome_exibicao: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  public readonly token_acesso: string;

  @ApiProperty({ minLength: 43, maxLength: 43 })
  public readonly token_refresh: string;

  @ApiProperty({ format: 'date-time' })
  public readonly acesso_expira_em: string;

  @ApiProperty({ format: 'date-time' })
  public readonly refresh_expira_em: string;

  public constructor(sessao: SessaoMobileEmitida) {
    this.sessao_id = sessao.id;
    this.usuario_id = sessao.usuarioId;
    this.dispositivo_id = sessao.dispositivoId;
    this.nome_exibicao = sessao.nomeExibicao;
    this.token_acesso = sessao.tokenAcesso;
    this.token_refresh = sessao.tokenRefresh;
    this.acesso_expira_em = sessao.acessoExpiraEm.toISOString();
    this.refresh_expira_em = sessao.refreshExpiraEm.toISOString();
  }
}

export class ContextoSessaoMobileDto {
  @ApiProperty({ format: 'uuid' })
  public readonly sessao_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly usuario_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly dispositivo_id: string;

  @ApiProperty()
  public readonly nome_exibicao: string;

  @ApiProperty({ format: 'date-time' })
  public readonly acesso_expira_em: string;

  public constructor(sessao: SessaoMobileAutenticada) {
    this.sessao_id = sessao.contexto.sessaoId;
    this.usuario_id = sessao.contexto.usuarioId;
    this.dispositivo_id = sessao.dispositivoId;
    this.nome_exibicao = sessao.nomeExibicao;
    this.acesso_expira_em = sessao.contexto.expiraEm.toISOString();
  }
}
