import { createHash } from 'node:crypto';

import type { SubmissaoFormularioNormalizada } from '../../../formularios/modelo-formulario.js';
import type { ObjetoJsonProtegido, ValorJsonProtegido } from '../../../seguranca/modelo-dados-protegidos.js';

export interface SubmissaoFlowMetaCloudCaracterizada {
  readonly flow_id: string;
  readonly flow_token: string;
  readonly response_json: string | Readonly<Record<string, unknown>>;
}

export function normalizarSubmissaoFlowMetaCloud(
  entrada: SubmissaoFlowMetaCloudCaracterizada,
): SubmissaoFormularioNormalizada {
  const resposta: unknown =
    typeof entrada.response_json === 'string'
      ? JSON.parse(entrada.response_json)
      : entrada.response_json;
  if (
    entrada.flow_id.trim().length < 1 ||
    entrada.flow_id.length > 256 ||
    entrada.flow_token.length < 16 ||
    !objetoJsonValido(resposta)
  ) {
    throw new Error('SUBMISSAO_FLOW_META_INVALIDA');
  }
  const referenciaCanal = createHash('sha256')
    .update(`${entrada.flow_id}:${entrada.flow_token}:${JSON.stringify(resposta)}`)
    .digest('hex');
  return {
    dadosProtegidos: structuredClone(resposta),
    formularioReferenciaCanal: entrada.flow_id,
    referenciaCanal,
  };
}

function objetoJsonValido(valor: unknown): valor is ObjetoJsonProtegido {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return false;
  return Object.values(valor).every((item) => valorJsonValido(item));
}

function valorJsonValido(valor: unknown): valor is ValorJsonProtegido {
  if (
    valor === null ||
    typeof valor === 'string' ||
    typeof valor === 'boolean' ||
    (typeof valor === 'number' && Number.isFinite(valor))
  ) return true;
  if (Array.isArray(valor)) return valor.every((item) => valorJsonValido(item));
  return objetoJsonValido(valor);
}
