import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ProtocoloErpPersistido } from './modelo-protocolo-erp.js';

export const REPOSITORIO_PROTOCOLOS_ERP = Symbol('REPOSITORIO_PROTOCOLOS_ERP');

export interface RepositorioProtocolosErp {
  atendimentoExiste(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obter(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ProtocoloErpPersistido | undefined>;
  criarPendente(
    protocolo: ProtocoloErpPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  confirmar(
    protocolo: ProtocoloErpPersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}

