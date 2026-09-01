import { ApiProperty } from '@nestjs/swagger';

import type {
  LoteSincronizacaoIncremental,
  SnapshotSincronizacaoCompleta,
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

export class SnapshotSincronizacaoDto {
  @ApiProperty({ example: '123' })
  public readonly sequencia_base: string;

  @ApiProperty({ format: 'date-time' })
  public readonly gerado_em: string;

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  public readonly permissoes: readonly string[];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly filas: SnapshotSincronizacaoCompleta['filas'];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly atendimentos: SnapshotSincronizacaoCompleta['atendimentos'];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly conversas: SnapshotSincronizacaoCompleta['conversas'];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly mensagens_recentes: SnapshotSincronizacaoCompleta['mensagensRecentes'];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly notas_internas_recentes: SnapshotSincronizacaoCompleta['notasInternasRecentes'];

  @ApiProperty({ additionalProperties: { type: 'boolean' }, type: 'object' })
  public readonly controles_recurso: SnapshotSincronizacaoCompleta['controlesRecurso'];

  @ApiProperty({ items: { type: 'object' }, type: 'array' })
  public readonly politicas_versao: SnapshotSincronizacaoCompleta['politicasVersao'];

  public constructor(snapshot: SnapshotSincronizacaoCompleta) {
    this.atendimentos = snapshot.atendimentos;
    this.controles_recurso = snapshot.controlesRecurso;
    this.conversas = snapshot.conversas;
    this.filas = snapshot.filas;
    this.gerado_em = snapshot.geradoEm;
    this.mensagens_recentes = snapshot.mensagensRecentes;
    this.notas_internas_recentes = snapshot.notasInternasRecentes;
    this.permissoes = snapshot.permissoes;
    this.politicas_versao = snapshot.politicasVersao;
    this.sequencia_base = snapshot.sequenciaBase;
  }
}
