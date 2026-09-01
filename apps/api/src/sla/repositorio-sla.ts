import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlertaSlaEmitido,
  ContextoObrigacaoHumana,
  NivelAlertaSla,
  RelogioSlaPersistido,
} from './modelo-sla.js';

export const REPOSITORIO_SLA = Symbol('REPOSITORIO_SLA');

export interface RepositorioSla {
  bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterContextoObrigacaoHumana(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoObrigacaoHumana | 'SEM_POLITICA' | undefined>;
  obterRelogioAtivo(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<RelogioSlaPersistido | undefined>;
  proximoNumeroCiclo(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  criarRelogio(
    relogio: RelogioSlaPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  registrarAlerta(
    alerta: AlertaSlaEmitido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  alertaJaEmitido(
    relogioSlaId: string,
    nivel: NivelAlertaSla,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  concluirRelogio(
    relogioSlaId: string,
    finalizadoEm: Date,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
