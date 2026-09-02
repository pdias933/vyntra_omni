export const PERIODOS_RELATORIO = ['24H', '7D', '30D'] as const;
export type PeriodoRelatorio = (typeof PERIODOS_RELATORIO)[number];

export interface RelatorioOperacional {
  readonly periodo: PeriodoRelatorio;
  readonly inicio: Date;
  readonly fim: Date;
  readonly formulasVersao: '1';
  readonly filas: readonly {
    readonly filaId: string;
    readonly nome: string;
    readonly aguardando: number;
    readonly emAtendimento: number;
    readonly encerrados: number;
  }[];
  readonly sla: { readonly atendente: number; readonly supervisor: number; readonly administrador: number };
  readonly mensagens: { readonly recebidas: number; readonly enviadas: number; readonly entregues: number; readonly lidas: number; readonly falhas: number; readonly taxaEntrega: number };
  readonly fluxos: { readonly ativos: number; readonly concluidos: number; readonly falhas: number };
  readonly erp: { readonly pendentes: number; readonly concluidas: number; readonly resultadosIncertos: number; readonly falhasDefinitivas: number };
}
