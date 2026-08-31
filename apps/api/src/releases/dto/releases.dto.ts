import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import type {
  AvaliacaoPoliticaVersaoMobile,
  ConfiguracaoClienteMobile,
  ControleRecursoPersistido,
  PoliticaVersaoMobilePersistida,
} from '../modelo-releases.js';

const VERSAO_SEMANTICA =
  /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u;

export class EntradaAvaliacaoVersaoMobileDto {
  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  public readonly plataforma!: 'ANDROID' | 'IOS';

  @ApiProperty({ example: '1.0.0', maxLength: 40 })
  @IsString()
  @Matches(VERSAO_SEMANTICA)
  public readonly versao_aplicativo!: string;
}

export class EntradaAtualizacaoControleRecursoDto {
  @ApiProperty({ enum: ['ATIVADO', 'DESATIVADO'] })
  @IsIn(['ATIVADO', 'DESATIVADO'])
  public readonly estado!: 'ATIVADO' | 'DESATIVADO';

  @ApiProperty()
  @IsBoolean()
  public readonly desligado_emergencialmente!: boolean;

  @ApiProperty()
  @IsBoolean()
  public readonly liberar_administradores!: boolean;

  @ApiProperty({ maximum: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(100)
  public readonly percentual_liberacao!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  public readonly usuarios_alvo!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  public readonly filas_alvo!: string[];

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_esperada!: number;
}

export class EntradaAtualizacaoPoliticaVersaoMobileDto {
  @ApiProperty({ example: '1.0.0', maxLength: 40 })
  @IsString()
  @Matches(VERSAO_SEMANTICA)
  public readonly versao_minima!: string;

  @ApiProperty({ example: '1.1.0', maxLength: 40 })
  @IsString()
  @Matches(VERSAO_SEMANTICA)
  public readonly versao_recomendada!: string;

  @ApiProperty({ maxLength: 240, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 240)
  public readonly mensagem?: string;

  @ApiProperty({ maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  public readonly url_loja?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_esperada!: number;
}

export class AvaliacaoPoliticaVersaoMobileDto {
  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  public readonly plataforma: 'ANDROID' | 'IOS';

  @ApiProperty()
  public readonly versao_informada: string;

  @ApiProperty()
  public readonly versao_minima: string;

  @ApiProperty()
  public readonly versao_recomendada: string;

  @ApiProperty()
  public readonly atualizacao_obrigatoria: boolean;

  @ApiProperty()
  public readonly atualizacao_recomendada: boolean;

  @ApiProperty({ required: false })
  public readonly mensagem?: string;

  @ApiProperty({ required: false })
  public readonly url_loja?: string;

  public constructor(avaliacao: AvaliacaoPoliticaVersaoMobile) {
    this.plataforma = avaliacao.plataforma;
    this.versao_informada = avaliacao.versaoInformada;
    this.versao_minima = avaliacao.versaoMinima;
    this.versao_recomendada = avaliacao.versaoRecomendada;
    this.atualizacao_obrigatoria = avaliacao.atualizacaoObrigatoria;
    this.atualizacao_recomendada = avaliacao.atualizacaoRecomendada;
    if (avaliacao.mensagem !== undefined) this.mensagem = avaliacao.mensagem;
    if (avaliacao.urlLoja !== undefined) this.url_loja = avaliacao.urlLoja;
  }
}

export class ConfiguracaoClienteMobileDto {
  @ApiProperty({ type: AvaliacaoPoliticaVersaoMobileDto })
  public readonly politica: AvaliacaoPoliticaVersaoMobileDto;

  @ApiProperty({
    additionalProperties: { type: 'boolean' },
    type: 'object',
  })
  public readonly controles_recurso: Readonly<Record<string, boolean>>;

  public constructor(configuracao: ConfiguracaoClienteMobile) {
    this.politica = new AvaliacaoPoliticaVersaoMobileDto(configuracao.politica);
    this.controles_recurso = configuracao.controlesRecurso;
  }
}

export class ConfiguracaoClienteWebDto {
  @ApiProperty({
    additionalProperties: { type: 'boolean' },
    type: 'object',
  })
  public readonly controles_recurso: Readonly<Record<string, boolean>>;

  public constructor(controles: Readonly<Record<string, boolean>>) {
    this.controles_recurso = controles;
  }
}

export class ControleRecursoDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly codigo: string;

  @ApiProperty({ enum: ['ATIVADO', 'DESATIVADO'] })
  public readonly estado: 'ATIVADO' | 'DESATIVADO';

  @ApiProperty()
  public readonly desligado_emergencialmente: boolean;

  @ApiProperty()
  public readonly liberar_administradores: boolean;

  @ApiProperty()
  public readonly percentual_liberacao: number;

  @ApiProperty({ type: [String] })
  public readonly usuarios_alvo: readonly string[];

  @ApiProperty({ type: [String] })
  public readonly filas_alvo: readonly string[];

  @ApiProperty()
  public readonly versao: number;

  public constructor(controle: ControleRecursoPersistido) {
    this.id = controle.id;
    this.codigo = controle.codigo;
    this.estado = controle.estado;
    this.desligado_emergencialmente = controle.desligadoEmergencialmente;
    this.liberar_administradores = controle.liberarAdministradores;
    this.percentual_liberacao = controle.percentualLiberacao;
    this.usuarios_alvo = controle.usuariosAlvo;
    this.filas_alvo = controle.filasAlvo;
    this.versao = controle.versao;
  }
}

export class PoliticaVersaoMobileDto {
  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  public readonly plataforma: 'ANDROID' | 'IOS';

  @ApiProperty()
  public readonly versao_minima: string;

  @ApiProperty()
  public readonly versao_recomendada: string;

  @ApiProperty({ required: false })
  public readonly mensagem?: string;

  @ApiProperty({ required: false })
  public readonly url_loja?: string;

  @ApiProperty()
  public readonly versao: number;

  public constructor(politica: PoliticaVersaoMobilePersistida) {
    this.plataforma = politica.plataforma;
    this.versao_minima = politica.versaoMinima;
    this.versao_recomendada = politica.versaoRecomendada;
    this.versao = politica.versao;
    if (politica.mensagem !== undefined) this.mensagem = politica.mensagem;
    if (politica.urlLoja !== undefined) this.url_loja = politica.urlLoja;
  }
}

export class AdministracaoReleasesDto {
  @ApiProperty({ type: [ControleRecursoDto] })
  public readonly controles: readonly ControleRecursoDto[];

  @ApiProperty({ type: [PoliticaVersaoMobileDto] })
  public readonly politicas_mobile: readonly PoliticaVersaoMobileDto[];

  public constructor(entrada: {
    readonly controles: readonly ControleRecursoPersistido[];
    readonly politicas: readonly PoliticaVersaoMobilePersistida[];
  }) {
    this.controles = entrada.controles.map(
      (controle) => new ControleRecursoDto(controle),
    );
    this.politicas_mobile = entrada.politicas.map(
      (politica) => new PoliticaVersaoMobileDto(politica),
    );
  }
}
