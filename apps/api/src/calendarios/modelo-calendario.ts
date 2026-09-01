export interface PeriodoMinutos {
  readonly minutoInicio: number;
  readonly minutoFim: number;
}

export interface PeriodoSemanal extends PeriodoMinutos {
  readonly diaSemana: number;
}

export interface ExcecaoCalendarioComposta {
  readonly dataLocal: string;
  readonly estado: 'ABERTO' | 'FECHADO';
  readonly diaInteiro: boolean;
  readonly periodos: readonly PeriodoMinutos[];
}

export interface OverrideCalendarioPersistido {
  readonly id: string;
  readonly calendarioId: string;
  readonly estado: 'ABERTO' | 'FECHADO';
  readonly motivo: string;
  readonly vigenteDe: Date;
  readonly vigenteAte: Date;
  readonly executadoPorUsuarioId: string;
  readonly criadoEm: Date;
}

export interface CalendarioComposto {
  readonly id: string;
  readonly nome: string;
  readonly fusoHorario: string;
  readonly modo: 'PERIODOS' | 'VINTE_QUATRO_SETE';
  readonly contaWhatsAppId?: string | undefined;
  readonly filaId?: string | undefined;
  readonly versao: number;
  readonly periodosSemanais: readonly PeriodoSemanal[];
  readonly feriados: readonly string[];
  readonly excecoes: readonly ExcecaoCalendarioComposta[];
  readonly overrides: readonly OverrideCalendarioPersistido[];
}

export interface ResultadoCalendario {
  readonly estado: 'ABERTO' | 'FECHADO';
  readonly origem:
    | 'OVERRIDE_MANUAL'
    | 'EXCECAO'
    | 'FERIADO'
    | 'VINTE_QUATRO_SETE'
    | 'PERIODO_SEMANAL'
    | 'FORA_DO_PERIODO';
  readonly calendarioId: string;
  readonly versao: number;
}
