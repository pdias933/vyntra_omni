import { ErroCalendarioInvalido } from './erros-calendario.js';
import type {
  CalendarioComposto,
  PeriodoMinutos,
  ResultadoCalendario,
} from './modelo-calendario.js';

export class AvaliadorCalendario {
  public avaliar(
    calendario: CalendarioComposto,
    instante: Date,
  ): ResultadoCalendario {
    if (Number.isNaN(instante.getTime())) throw new ErroCalendarioInvalido();
    const local = this.obterInstanteLocal(instante, calendario.fusoHorario);
    const override = calendario.overrides
      .filter(({ vigenteDe, vigenteAte }) =>
        vigenteDe <= instante && instante < vigenteAte,
      )
      .sort((a, b) => b.vigenteDe.getTime() - a.vigenteDe.getTime())[0];
    if (override !== undefined) {
      return this.resultado(calendario, override.estado, 'OVERRIDE_MANUAL');
    }
    const excecao = calendario.excecoes.find(
      ({ dataLocal }) => dataLocal === local.data,
    );
    if (excecao !== undefined) {
      const aberto =
        excecao.estado === 'ABERTO' &&
        (excecao.diaInteiro || this.estaEmPeriodo(excecao.periodos, local.minuto));
      return this.resultado(
        calendario,
        aberto ? 'ABERTO' : 'FECHADO',
        'EXCECAO',
      );
    }
    if (calendario.feriados.includes(local.data)) {
      return this.resultado(calendario, 'FECHADO', 'FERIADO');
    }
    if (calendario.modo === 'VINTE_QUATRO_SETE') {
      return this.resultado(calendario, 'ABERTO', 'VINTE_QUATRO_SETE');
    }
    const aberto = this.estaEmPeriodo(
      calendario.periodosSemanais.filter(
        ({ diaSemana }) => diaSemana === local.diaSemana,
      ),
      local.minuto,
    );
    return this.resultado(
      calendario,
      aberto ? 'ABERTO' : 'FECHADO',
      aberto ? 'PERIODO_SEMANAL' : 'FORA_DO_PERIODO',
    );
  }

  private estaEmPeriodo(
    periodos: readonly PeriodoMinutos[],
    minuto: number,
  ): boolean {
    return periodos.some(
      ({ minutoInicio, minutoFim }) =>
        minutoInicio <= minuto && minuto < minutoFim,
    );
  }

  private obterInstanteLocal(
    instante: Date,
    fusoHorario: string,
  ): { readonly data: string; readonly diaSemana: number; readonly minuto: number } {
    let partes: Intl.DateTimeFormatPart[];
    try {
      partes = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        timeZone: fusoHorario,
        year: 'numeric',
      }).formatToParts(instante);
    } catch {
      throw new ErroCalendarioInvalido();
    }
    const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
      const encontrado = partes.find((parte) => parte.type === tipo)?.value;
      if (encontrado === undefined) throw new ErroCalendarioInvalido();
      return Number(encontrado);
    };
    const ano = valor('year');
    const mes = valor('month');
    const dia = valor('day');
    const hora = valor('hour');
    const minuto = valor('minute');
    return {
      data: `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      diaSemana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(),
      minuto: hora * 60 + minuto,
    };
  }

  private resultado(
    calendario: CalendarioComposto,
    estado: 'ABERTO' | 'FECHADO',
    origem: ResultadoCalendario['origem'],
  ): ResultadoCalendario {
    return {
      calendarioId: calendario.id,
      estado,
      origem,
      versao: calendario.versao,
    };
  }
}
