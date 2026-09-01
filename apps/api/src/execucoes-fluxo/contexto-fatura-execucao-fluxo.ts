import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from '../seguranca/modelo-dados-protegidos.js';

const CHAVE_FATURA = 'faturaFluxo';
const IDENTIFICADOR = /^[\x20-\x7E]{1,256}$/u;
const DATA = /^\d{4}-\d{2}-\d{2}$/u;

export interface SelecaoFaturaExecucaoFluxo {
  readonly contextoAtendimentoVersao: number;
  readonly contratoExternoId: string;
  readonly faturaExternaId: string;
  readonly situacao: 'ABERTA' | 'VENCIDA';
  readonly valorCentavos: number;
  readonly vencimento: string;
}

export function lerSelecaoFaturaExecucaoFluxo(
  contexto: ObjetoJsonProtegido,
): SelecaoFaturaExecucaoFluxo | undefined {
  const valor = contexto[CHAVE_FATURA];
  if (!ehObjeto(valor)) return undefined;
  const chaves = Object.keys(valor);
  if (
    chaves.length !== 6 ||
    !chaves.every((chave) =>
      [
        'contextoAtendimentoVersao',
        'contratoExternoId',
        'faturaExternaId',
        'situacao',
        'valorCentavos',
        'vencimento',
      ].includes(chave),
    ) ||
    typeof valor.contextoAtendimentoVersao !== 'number' ||
    !Number.isSafeInteger(valor.contextoAtendimentoVersao) ||
    valor.contextoAtendimentoVersao < 1 ||
    typeof valor.contratoExternoId !== 'string' ||
    !IDENTIFICADOR.test(valor.contratoExternoId) ||
    typeof valor.faturaExternaId !== 'string' ||
    !IDENTIFICADOR.test(valor.faturaExternaId) ||
    (valor.situacao !== 'ABERTA' && valor.situacao !== 'VENCIDA') ||
    typeof valor.valorCentavos !== 'number' ||
    !Number.isSafeInteger(valor.valorCentavos) ||
    valor.valorCentavos < 0 ||
    typeof valor.vencimento !== 'string' ||
    !DATA.test(valor.vencimento)
  ) {
    return undefined;
  }
  return {
    contextoAtendimentoVersao: valor.contextoAtendimentoVersao,
    contratoExternoId: valor.contratoExternoId,
    faturaExternaId: valor.faturaExternaId,
    situacao: valor.situacao,
    valorCentavos: valor.valorCentavos,
    vencimento: valor.vencimento,
  };
}

export function definirSelecaoFaturaExecucaoFluxo(
  contexto: ObjetoJsonProtegido,
  selecao: SelecaoFaturaExecucaoFluxo,
): ObjetoJsonProtegido | undefined {
  const candidata = { ...contexto, [CHAVE_FATURA]: { ...selecao } };
  return lerSelecaoFaturaExecucaoFluxo(candidata) === undefined
    ? undefined
    : candidata;
}

export function removerSelecaoFaturaExecucaoFluxo(
  contexto: ObjetoJsonProtegido,
): ObjetoJsonProtegido {
  const { [CHAVE_FATURA]: _removida, ...restante } = contexto;
  return restante;
}

function ehObjeto(
  valor: ValorJsonProtegido | undefined,
): valor is ObjetoJsonProtegido {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}
