import { createHash } from 'node:crypto';

import type { EventoEstadoMensagemNormalizado } from '../../../mensagens/modelo-estado-mensagem.js';

const ESTADOS = {
  delivered: 'ENTREGUE',
  failed: 'FALHOU',
  read: 'LIDA',
  sent: 'ENVIADA',
} as const;

export interface EstadoMetaCloudCaracterizado {
  readonly id: string;
  readonly status: keyof typeof ESTADOS;
  readonly timestamp: string;
  readonly errors?: readonly { readonly code?: number }[];
}

export function normalizarEstadoMetaCloud(
  contaWhatsAppId: string,
  estado: EstadoMetaCloudCaracterizado,
): EventoEstadoMensagemNormalizado {
  const ocorridoEm = new Date(Number(estado.timestamp) * 1_000);
  const codigoExterno = estado.errors?.[0]?.code;
  const identificadorEventoExterno = createHash('sha256')
    .update(`${estado.id}:${estado.status}:${estado.timestamp}:${codigoExterno ?? ''}`)
    .digest('hex');
  return {
    contaWhatsAppId,
    estado: ESTADOS[estado.status],
    identificadorEventoExterno,
    identificadorMensagemExterno: estado.id,
    ocorridoEm,
    ...(estado.status === 'failed'
      ? { codigoFalha: `META_${codigoExterno ?? 'DESCONHECIDA'}` }
      : {}),
  };
}
