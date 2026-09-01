import type {
  EstadoModeloMensagem,
  ModeloMensagemObservado,
} from '../../../modelos-mensagem/catalogo-modelos-mensagem.js';
import type { ObjetoJsonProtegido } from '../../../seguranca/modelo-dados-protegidos.js';

const ESTADOS: Readonly<Record<string, EstadoModeloMensagem>> = {
  APPROVED: 'APROVADO',
  DISABLED: 'DESATIVADO',
  PAUSED: 'PAUSADO',
  REJECTED: 'REJEITADO',
};

export interface ModeloMetaCloudCaracterizado {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly status: string;
  readonly parameter_count: number;
  readonly components: ObjetoJsonProtegido;
}

export function normalizarModeloMetaCloud(
  modelo: ModeloMetaCloudCaracterizado,
): ModeloMensagemObservado {
  const estado = ESTADOS[modelo.status];
  if (estado === undefined) throw new Error('ESTADO_MODELO_META_DESCONHECIDO');
  return {
    componentesProtegidos: structuredClone(modelo.components),
    estado,
    idioma: modelo.language,
    nome: modelo.name,
    quantidadeParametros: modelo.parameter_count,
    referenciaCanal: modelo.id,
  };
}
