import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import type { TipoNoFluxo } from '../fluxos/modelo-validacao-fluxo.js';

export type EstadoPassoExecucaoFluxo = 'INICIADO' | 'CONCLUIDO' | 'FALHOU';

export interface PassoExecucaoFluxoPersistido {
  readonly id: string;
  readonly execucaoFluxoId: string;
  readonly revisaoExecucao: number;
  readonly noId: string;
  readonly tipoNo: TipoNoFluxo;
  readonly estado: EstadoPassoExecucaoFluxo;
  readonly entradaSanitizada: ObjetoJsonProtegido;
  readonly saidaSanitizada?: ObjetoJsonProtegido | undefined;
  readonly codigoErro?: string | undefined;
  readonly iniciadoEm: Date;
  readonly finalizadoEm?: Date | undefined;
}

export type ResultadoNoMensagemFluxo =
  | 'SUCESSO'
  | 'FALLBACK'
  | 'FALHA_TEMPORARIA'
  | 'FALHA_DEFINITIVA';
