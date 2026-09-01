import type { TipoVariavelFluxo } from '../fluxos/modelo-validacao-fluxo.js';
import {
  valorCompativelComTipo,
  type ValorVariavelFluxo,
} from '../fluxos/valor-variavel-fluxo.js';
import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from '../seguranca/modelo-dados-protegidos.js';

const CHAVE_VARIAVEIS = 'variaveisFluxo';
const CHAVE_ITERACOES = 'iteracoesFluxo';

export function lerValorVariavelExecucao(
  contexto: ObjetoJsonProtegido,
  nome: string,
  tipo: TipoVariavelFluxo,
): ValorVariavelFluxo | undefined {
  const variaveis = lerObjeto(contexto[CHAVE_VARIAVEIS]);
  if (variaveis === undefined) return undefined;
  const valor = variaveis[nome];
  return valorCompativelComTipo(tipo, valor) ? valor : undefined;
}

export function definirValorVariavelExecucao(
  contexto: ObjetoJsonProtegido,
  nome: string,
  tipo: TipoVariavelFluxo,
  valor: unknown,
): ObjetoJsonProtegido | undefined {
  if (!valorCompativelComTipo(tipo, valor)) return undefined;
  const variaveis = lerObjeto(contexto[CHAVE_VARIAVEIS]) ?? {};
  return {
    ...contexto,
    [CHAVE_VARIAVEIS]: { ...variaveis, [nome]: valor },
  };
}

export function registrarIteracaoNoFluxo(
  contexto: ObjetoJsonProtegido,
  noId: string,
  limite: number | undefined,
): {
  readonly contexto: ObjetoJsonProtegido;
  readonly excedeu: boolean;
  readonly valido: boolean;
} {
  if (limite === undefined) return { contexto, excedeu: false, valido: true };
  const bruto = contexto[CHAVE_ITERACOES];
  const objetoIteracoes = lerObjeto(bruto);
  if (bruto !== undefined && objetoIteracoes === undefined) {
    return { contexto, excedeu: false, valido: false };
  }
  const iteracoes = objetoIteracoes ?? {};
  const anterior = iteracoes[noId];
  if (
    anterior !== undefined &&
    (typeof anterior !== 'number' ||
      !Number.isSafeInteger(anterior) ||
      anterior < 0)
  ) {
    return { contexto, excedeu: false, valido: false };
  }
  const quantidade = typeof anterior === 'number' ? anterior + 1 : 1;
  return {
    contexto: {
      ...contexto,
      [CHAVE_ITERACOES]: { ...iteracoes, [noId]: quantidade },
    },
    excedeu: quantidade > limite,
    valido: true,
  };
}

function lerObjeto(
  valor: ValorJsonProtegido | undefined,
): ObjetoJsonProtegido | undefined {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? valor
    : undefined;
}
