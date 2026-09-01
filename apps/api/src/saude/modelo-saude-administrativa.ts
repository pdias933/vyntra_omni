import type { EstadoOperacaoRecuperavel } from '../idempotencia/modelo-idempotencia.js';

export type EstadoComponenteSaude =
  | 'INDISPONIVEL'
  | 'NAO_CONFIGURADO'
  | 'OPERACIONAL';

export interface ComponenteSaudeAdministrativa {
  readonly codigo: 'API' | 'POSTGRESQL' | 'REDIS' | 'STORAGE';
  readonly estado: EstadoComponenteSaude;
}

export interface OperacaoSaudeAdministrativa {
  readonly atualizadoEm: Date;
  readonly codigoUltimoErro?: string;
  readonly estado: EstadoOperacaoRecuperavel;
  readonly id: string;
  readonly proximaAcaoEm?: Date;
  readonly podeReprocessar: boolean;
  readonly tentativas: number;
  readonly tipo: string;
  readonly versao: number;
}

export interface ResumoFalhasSaudeAdministrativa {
  readonly aguardandoNovaTentativa: number;
  readonly falhasDefinitivas: number;
  readonly itensCaixaSaidaPendentes: number;
  readonly resultadosIncertos: number;
}

export interface PainelSaudeAdministrativa {
  readonly componentes: readonly ComponenteSaudeAdministrativa[];
  readonly operacoes: readonly OperacaoSaudeAdministrativa[];
  readonly resumo: ResumoFalhasSaudeAdministrativa;
}
