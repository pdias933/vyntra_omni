export const NIVEIS_ALERTA_SLA = [
  'ATENDENTE',
  'SUPERVISOR',
  'ADMINISTRADOR',
] as const;

export type NivelAlertaSla = (typeof NIVEIS_ALERTA_SLA)[number];

export interface PoliticaSlaPersistida {
  readonly id: string;
  readonly filaId: string;
  readonly alertaAtendenteAposMinutos: number;
  readonly alertaSupervisorAposMinutos: number;
  readonly alertaAdministradorAposMinutos: number;
  readonly versao: number;
}

export interface ContextoObrigacaoHumana {
  readonly atendimentoId: string;
  readonly conversaId: string;
  readonly filaId: string;
  readonly estado: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  readonly modo: 'FILA_HUMANA' | 'HUMANO';
  readonly politica: PoliticaSlaPersistida;
}

export interface RelogioSlaPersistido {
  readonly id: string;
  readonly atendimentoId: string;
  readonly politicaSlaId: string;
  readonly numeroCiclo: number;
  readonly obrigacaoHumanaEm: Date;
  readonly alertaAtendenteEm: Date;
  readonly alertaSupervisorEm: Date;
  readonly alertaAdministradorEm: Date;
  readonly finalizadoEm?: Date | undefined;
  readonly versao: number;
}

export interface AlertaSlaEmitido {
  readonly id: string;
  readonly relogioSlaId: string;
  readonly nivel: NivelAlertaSla;
  readonly previstoEm: Date;
  readonly emitidoEm: Date;
}
