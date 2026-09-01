import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

import type { FluxoEditorPersistido } from '../modelo-editor-fluxo.js';
import type {
  FluxoPersistido,
  ResultadoMudancaPublicacaoFluxo,
  TipoFluxo,
  VersaoFluxoPersistida,
} from '../modelo-fluxo.js';
import type {
  ProblemaValidacaoFluxo,
  ResultadoPreparacaoPublicacaoFluxo,
} from '../modelo-validacao-fluxo.js';
import {
  CENARIOS_SIMULACAO_FLUXO,
  type ResultadoSimulacaoFluxo,
} from '../modelo-simulacao-fluxo.js';

const TIPOS_FLUXO = [
  'ATENDIMENTO',
  'AUTENTICACAO',
  'FINANCEIRO',
  'COMERCIAL',
  'SUPORTE',
  'OUTRO',
] as const;

export class EntradaCriacaoFluxoEditorDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  public readonly nome!: string;

  @ApiProperty({ maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  public readonly descricao?: string;

  @ApiProperty({ enum: TIPOS_FLUXO })
  @IsIn(TIPOS_FLUXO)
  public readonly tipo!: TipoFluxo;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  @IsObject()
  public readonly definicao!: Record<string, unknown>;
}

export class EntradaNovaVersaoFluxoEditorDto {
  @ApiProperty({ additionalProperties: true, type: 'object' })
  @IsObject()
  public readonly definicao!: Record<string, unknown>;

  @ApiProperty({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  public readonly versao_schema_definicao!: number;
}

export class EntradaSalvarRascunhoFluxoDto extends EntradaNovaVersaoFluxoEditorDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  public readonly revisao_esperada!: number;
}

export class EntradaRevisaoVersaoFluxoDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  public readonly revisao_esperada!: number;
}

export class EntradaRevisaoFluxoDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  public readonly revisao_fluxo_esperada!: number;
}

export class EntradaSimulacaoFluxoDto {
  @ApiProperty({ additionalProperties: true, type: 'object' })
  @IsObject()
  public readonly definicao!: Record<string, unknown>;

  @ApiProperty({ enum: CENARIOS_SIMULACAO_FLUXO })
  @IsIn(CENARIOS_SIMULACAO_FLUXO)
  public readonly cenario!: (typeof CENARIOS_SIMULACAO_FLUXO)[number];
}

export class VersaoFluxoEditorDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly fluxo_id: string;

  @ApiProperty({ minimum: 1 })
  public readonly numero_versao: number;

  @ApiProperty({ enum: ['RASCUNHO', 'EM_TESTE', 'PUBLICADA', 'ARQUIVADA'] })
  public readonly estado: string;

  @ApiProperty({ minimum: 1 })
  public readonly revisao: number;

  @ApiProperty({ minimum: 1 })
  public readonly versao_schema_definicao: number;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  public readonly definicao: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  public readonly atualizada_em: string;

  @ApiProperty({ format: 'date-time', required: false })
  public readonly publicada_em?: string;

  public constructor(versao: VersaoFluxoPersistida) {
    this.id = versao.id;
    this.fluxo_id = versao.fluxoId;
    this.numero_versao = versao.numeroVersao;
    this.estado = versao.estado;
    this.revisao = versao.revisao;
    this.versao_schema_definicao = versao.versaoSchemaDefinicao;
    this.definicao = versao.definicao;
    this.atualizada_em = versao.atualizadaEm.toISOString();
    if (versao.publicadaEm !== undefined) {
      this.publicada_em = versao.publicadaEm.toISOString();
    }
  }
}

export class FluxoEditorDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly nome: string;

  @ApiProperty({ required: false })
  public readonly descricao?: string;

  @ApiProperty({ enum: TIPOS_FLUXO })
  public readonly tipo: TipoFluxo;

  @ApiProperty()
  public readonly ativo: boolean;

  @ApiProperty({ minimum: 1 })
  public readonly revisao: number;

  @ApiProperty({ format: 'uuid', required: false })
  public readonly versao_publicada_id?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly atualizado_em: string;

  @ApiProperty({ type: [VersaoFluxoEditorDto] })
  public readonly versoes: readonly VersaoFluxoEditorDto[];

  public constructor(fluxo: FluxoEditorPersistido) {
    this.id = fluxo.id;
    this.nome = fluxo.nome;
    this.tipo = fluxo.tipo;
    this.ativo = fluxo.ativo;
    this.revisao = fluxo.revisao;
    this.atualizado_em = fluxo.atualizadoEm.toISOString();
    this.versoes = fluxo.versoes.map(
      (versao) => new VersaoFluxoEditorDto(versao),
    );
    if (fluxo.descricao !== undefined) this.descricao = fluxo.descricao;
    if (fluxo.versaoPublicadaId !== undefined) {
      this.versao_publicada_id = fluxo.versaoPublicadaId;
    }
  }
}

export class FluxoCriadoEditorDto {
  @ApiProperty({ type: FluxoEditorDto })
  public readonly fluxo: FluxoEditorDto;

  @ApiProperty({ type: VersaoFluxoEditorDto })
  public readonly versao: VersaoFluxoEditorDto;

  public constructor(
    fluxo: FluxoPersistido,
    versao: VersaoFluxoPersistida,
  ) {
    this.fluxo = new FluxoEditorDto({ ...fluxo, versoes: [versao] });
    this.versao = new VersaoFluxoEditorDto(versao);
  }
}

export class ProblemaValidacaoFluxoDto {
  @ApiProperty()
  public readonly codigo: string;

  @ApiProperty({ required: false })
  public readonly no_id?: string;

  @ApiProperty({ required: false })
  public readonly referencia_id?: string;

  @ApiProperty({ required: false })
  public readonly variavel?: string;

  public constructor(problema: ProblemaValidacaoFluxo) {
    this.codigo = problema.codigo;
    if (problema.noId !== undefined) this.no_id = problema.noId;
    if (problema.referenciaId !== undefined) {
      this.referencia_id = problema.referenciaId;
    }
    if (problema.variavel !== undefined) this.variavel = problema.variavel;
  }
}

export class ResultadoPreparacaoFluxoDto {
  @ApiProperty({ enum: ['EM_TESTE'] })
  public readonly estado: 'EM_TESTE';

  @ApiProperty({ format: 'uuid' })
  public readonly fluxo_id: string;

  @ApiProperty({ format: 'uuid' })
  public readonly versao_fluxo_id: string;

  @ApiProperty({ minimum: 1 })
  public readonly revisao_versao: number;

  @ApiProperty()
  public readonly valido: boolean;

  @ApiProperty()
  public readonly quantidade_nos: number;

  @ApiProperty()
  public readonly quantidade_conexoes: number;

  @ApiProperty({ type: [ProblemaValidacaoFluxoDto] })
  public readonly problemas: readonly ProblemaValidacaoFluxoDto[];

  public constructor(resultado: ResultadoPreparacaoPublicacaoFluxo) {
    this.estado = resultado.estado;
    this.fluxo_id = resultado.fluxoId;
    this.versao_fluxo_id = resultado.versaoFluxoId;
    this.revisao_versao = resultado.revisaoVersao;
    this.valido = resultado.relatorio.valido;
    this.quantidade_nos = resultado.relatorio.quantidadeNos;
    this.quantidade_conexoes = resultado.relatorio.quantidadeConexoes;
    this.problemas = resultado.relatorio.problemas.map(
      (problema) => new ProblemaValidacaoFluxoDto(problema),
    );
  }
}

export class ResultadoPublicacaoFluxoDto {
  @ApiProperty({ format: 'uuid' })
  public readonly fluxo_id: string;

  @ApiProperty({ enum: ['PUBLICACAO', 'ARQUIVAMENTO', 'REVERSAO'] })
  public readonly tipo: string;

  @ApiProperty({ minimum: 1 })
  public readonly revisao_fluxo: number;

  @ApiProperty({ format: 'uuid', required: false })
  public readonly versao_anterior_id?: string;

  @ApiProperty({ format: 'uuid', required: false })
  public readonly versao_publicada_id?: string;

  public constructor(resultado: ResultadoMudancaPublicacaoFluxo) {
    this.fluxo_id = resultado.fluxoId;
    this.tipo = resultado.tipo;
    this.revisao_fluxo = resultado.revisaoFluxo;
    if (resultado.versaoAnteriorId !== undefined) {
      this.versao_anterior_id = resultado.versaoAnteriorId;
    }
    if (resultado.versaoPublicadaId !== undefined) {
      this.versao_publicada_id = resultado.versaoPublicadaId;
    }
  }
}

export class ContextoFicticioSimulacaoFluxoDto {
  @ApiProperty()
  public readonly contato: string;

  @ApiProperty()
  public readonly contrato: string;

  @ApiProperty()
  public readonly documento: string;

  @ApiProperty()
  public readonly telefone: string;

  public constructor(contexto: ResultadoSimulacaoFluxo['contextoFicticio']) {
    this.contato = contexto.contato;
    this.contrato = contexto.contrato;
    this.documento = contexto.documento;
    this.telefone = contexto.telefone;
  }
}

export class PassoSimulacaoFluxoDto {
  @ApiProperty({ minimum: 1 })
  public readonly ordem: number;

  @ApiProperty()
  public readonly no_id: string;

  @ApiProperty()
  public readonly tipo_no: string;

  @ApiProperty({ enum: ['CONCLUIDO', 'INTERROMPIDO'] })
  public readonly estado: string;

  @ApiProperty({ required: false })
  public readonly saida?: string;

  @ApiProperty()
  public readonly descricao: string;

  public constructor(passo: ResultadoSimulacaoFluxo['passos'][number]) {
    this.ordem = passo.ordem;
    this.no_id = passo.noId;
    this.tipo_no = passo.tipoNo;
    this.estado = passo.estado;
    this.descricao = passo.descricao;
    if (passo.saida !== undefined) this.saida = passo.saida;
  }
}

export class ItemPreviaSimulacaoFluxoDto {
  @ApiProperty({ minimum: 1 })
  public readonly ordem_passo: number;

  @ApiProperty({ enum: ['CLIENTE_FICTICIO', 'EMPRESA', 'SISTEMA'] })
  public readonly origem: string;

  @ApiProperty()
  public readonly conteudo: string;

  public constructor(item: ResultadoSimulacaoFluxo['previa'][number]) {
    this.ordem_passo = item.ordemPasso;
    this.origem = item.origem;
    this.conteudo = item.conteudo;
  }
}

export class ResultadoSimulacaoFluxoDto {
  @ApiProperty({ enum: CENARIOS_SIMULACAO_FLUXO })
  public readonly cenario: string;

  @ApiProperty({ enum: ['CONCLUIDA', 'INTERROMPIDA', 'LIMITE_ATINGIDO'] })
  public readonly estado: string;

  @ApiProperty()
  public readonly codigo_final: string;

  @ApiProperty({ type: ContextoFicticioSimulacaoFluxoDto })
  public readonly contexto_ficticio: ContextoFicticioSimulacaoFluxoDto;

  @ApiProperty({ enum: [false] })
  public readonly efeitos_reais_executados: false;

  @ApiProperty({ type: [PassoSimulacaoFluxoDto] })
  public readonly passos: readonly PassoSimulacaoFluxoDto[];

  @ApiProperty({ type: [ItemPreviaSimulacaoFluxoDto] })
  public readonly previa: readonly ItemPreviaSimulacaoFluxoDto[];

  public constructor(resultado: ResultadoSimulacaoFluxo) {
    this.cenario = resultado.cenario;
    this.estado = resultado.estado;
    this.codigo_final = resultado.codigoFinal;
    this.contexto_ficticio = new ContextoFicticioSimulacaoFluxoDto(
      resultado.contextoFicticio,
    );
    this.efeitos_reais_executados = false;
    this.passos = resultado.passos.map(
      (passo) => new PassoSimulacaoFluxoDto(passo),
    );
    this.previa = resultado.previa.map(
      (item) => new ItemPreviaSimulacaoFluxoDto(item),
    );
  }
}
