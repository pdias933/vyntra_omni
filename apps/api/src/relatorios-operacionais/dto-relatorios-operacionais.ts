import { ApiProperty } from '@nestjs/swagger';

import { PERIODOS_RELATORIO, type PeriodoRelatorio, type RelatorioOperacional } from './modelo-relatorios-operacionais.js';

class FilaRelatorioDto {
  @ApiProperty({ format: 'uuid' }) public readonly fila_id: string;
  @ApiProperty() public readonly nome: string;
  @ApiProperty({ minimum: 0 }) public readonly aguardando: number;
  @ApiProperty({ minimum: 0 }) public readonly em_atendimento: number;
  @ApiProperty({ minimum: 0 }) public readonly encerrados: number;
  public constructor(fila: RelatorioOperacional['filas'][number]) {
    this.fila_id = fila.filaId; this.nome = fila.nome; this.aguardando = fila.aguardando;
    this.em_atendimento = fila.emAtendimento; this.encerrados = fila.encerrados;
  }
}

class SlaRelatorioDto {
  @ApiProperty({ minimum: 0 }) public readonly atendente: number;
  @ApiProperty({ minimum: 0 }) public readonly supervisor: number;
  @ApiProperty({ minimum: 0 }) public readonly administrador: number;
  public constructor(valor: RelatorioOperacional['sla']) { this.atendente = valor.atendente; this.supervisor = valor.supervisor; this.administrador = valor.administrador; }
}

class MensagensRelatorioDto {
  @ApiProperty({ minimum: 0 }) public readonly recebidas: number;
  @ApiProperty({ minimum: 0 }) public readonly enviadas: number;
  @ApiProperty({ minimum: 0 }) public readonly entregues: number;
  @ApiProperty({ minimum: 0 }) public readonly lidas: number;
  @ApiProperty({ minimum: 0 }) public readonly falhas: number;
  @ApiProperty({ maximum: 1, minimum: 0 }) public readonly taxa_entrega: number;
  public constructor(valor: RelatorioOperacional['mensagens']) { this.recebidas = valor.recebidas; this.enviadas = valor.enviadas; this.entregues = valor.entregues; this.lidas = valor.lidas; this.falhas = valor.falhas; this.taxa_entrega = valor.taxaEntrega; }
}

class FluxosRelatorioDto {
  @ApiProperty({ minimum: 0 }) public readonly ativos: number;
  @ApiProperty({ minimum: 0 }) public readonly concluidos: number;
  @ApiProperty({ minimum: 0 }) public readonly falhas: number;
  public constructor(valor: RelatorioOperacional['fluxos']) { this.ativos = valor.ativos; this.concluidos = valor.concluidos; this.falhas = valor.falhas; }
}

class ErpRelatorioDto {
  @ApiProperty({ minimum: 0 }) public readonly pendentes: number;
  @ApiProperty({ minimum: 0 }) public readonly concluidas: number;
  @ApiProperty({ minimum: 0 }) public readonly resultados_incertos: number;
  @ApiProperty({ minimum: 0 }) public readonly falhas_definitivas: number;
  public constructor(valor: RelatorioOperacional['erp']) { this.pendentes = valor.pendentes; this.concluidas = valor.concluidas; this.resultados_incertos = valor.resultadosIncertos; this.falhas_definitivas = valor.falhasDefinitivas; }
}

export class RelatorioOperacionalDto {
  @ApiProperty({ enum: PERIODOS_RELATORIO }) public readonly periodo: PeriodoRelatorio;
  @ApiProperty({ format: 'date-time' }) public readonly inicio: string;
  @ApiProperty({ format: 'date-time' }) public readonly fim: string;
  @ApiProperty({ enum: ['1'] }) public readonly formulas_versao: '1';
  @ApiProperty({ type: [FilaRelatorioDto] }) public readonly filas: readonly FilaRelatorioDto[];
  @ApiProperty({ type: SlaRelatorioDto }) public readonly sla: SlaRelatorioDto;
  @ApiProperty({ type: MensagensRelatorioDto }) public readonly mensagens: MensagensRelatorioDto;
  @ApiProperty({ type: FluxosRelatorioDto }) public readonly fluxos: FluxosRelatorioDto;
  @ApiProperty({ type: ErpRelatorioDto }) public readonly erp: ErpRelatorioDto;

  public constructor(relatorio: RelatorioOperacional) {
    this.periodo = relatorio.periodo; this.inicio = relatorio.inicio.toISOString(); this.fim = relatorio.fim.toISOString();
    this.formulas_versao = relatorio.formulasVersao; this.filas = relatorio.filas.map((fila) => new FilaRelatorioDto(fila));
    this.sla = new SlaRelatorioDto(relatorio.sla); this.mensagens = new MensagensRelatorioDto(relatorio.mensagens);
    this.fluxos = new FluxosRelatorioDto(relatorio.fluxos); this.erp = new ErpRelatorioDto(relatorio.erp);
  }
}
