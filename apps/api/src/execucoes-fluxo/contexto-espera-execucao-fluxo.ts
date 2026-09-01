import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from '../seguranca/modelo-dados-protegidos.js';

const CHAVE_ESPERAS = 'esperasFluxo';

export type TipoEsperaFluxo = 'ATE_INSTANTE' | 'RESPOSTA';

export interface EsperaFluxoPersistida {
  readonly retomarEm: string;
  readonly tipo: TipoEsperaFluxo;
  readonly respostaRecebida: boolean;
}

export type LeituraEsperaFluxo =
  | { readonly estado: 'AUSENTE' }
  | { readonly estado: 'INVALIDA' }
  | { readonly estado: 'PRESENTE'; readonly espera: EsperaFluxoPersistida };

export function lerEsperaFluxo(
  contexto: ObjetoJsonProtegido,
  noId: string,
): LeituraEsperaFluxo {
  const brutoEsperas = contexto[CHAVE_ESPERAS];
  if (brutoEsperas === undefined) return { estado: 'AUSENTE' };
  const esperas = lerObjeto(brutoEsperas);
  if (esperas === undefined) return { estado: 'INVALIDA' };
  const brutoEspera = esperas[noId];
  if (brutoEspera === undefined) return { estado: 'AUSENTE' };
  const espera = lerObjeto(brutoEspera);
  if (
    espera === undefined ||
    !temExatamenteChaves(espera, [
      'respostaRecebida',
      'retomarEm',
      'tipo',
    ]) ||
    typeof espera.retomarEm !== 'string' ||
    !ehDataHoraCanonica(espera.retomarEm) ||
    !ehTipoEspera(espera.tipo) ||
    typeof espera.respostaRecebida !== 'boolean' ||
    (espera.tipo === 'ATE_INSTANTE' && espera.respostaRecebida)
  ) {
    return { estado: 'INVALIDA' };
  }
  return {
    espera: {
      respostaRecebida: espera.respostaRecebida,
      retomarEm: espera.retomarEm,
      tipo: espera.tipo,
    },
    estado: 'PRESENTE',
  };
}

export function agendarEsperaFluxo(
  contexto: ObjetoJsonProtegido,
  noId: string,
  tipo: TipoEsperaFluxo,
  retomarEm: Date,
): ObjetoJsonProtegido | undefined {
  if (!Number.isFinite(retomarEm.getTime())) return undefined;
  const brutoEsperas = contexto[CHAVE_ESPERAS];
  const esperas = lerObjeto(brutoEsperas);
  if (brutoEsperas !== undefined && esperas === undefined) return undefined;
  return {
    ...contexto,
    [CHAVE_ESPERAS]: {
      ...(esperas ?? {}),
      [noId]: {
        respostaRecebida: false,
        retomarEm: retomarEm.toISOString(),
        tipo,
      },
    },
  };
}

export function marcarRespostaRecebidaFluxo(
  contexto: ObjetoJsonProtegido,
  noId: string,
): ObjetoJsonProtegido | undefined {
  const leitura = lerEsperaFluxo(contexto, noId);
  if (
    leitura.estado !== 'PRESENTE' ||
    leitura.espera.tipo !== 'RESPOSTA' ||
    leitura.espera.respostaRecebida
  ) {
    return undefined;
  }
  const esperas = lerObjeto(contexto[CHAVE_ESPERAS]);
  if (esperas === undefined) return undefined;
  return {
    ...contexto,
    [CHAVE_ESPERAS]: {
      ...esperas,
      [noId]: { ...leitura.espera, respostaRecebida: true },
    },
  };
}

export function removerEsperaFluxo(
  contexto: ObjetoJsonProtegido,
  noId: string,
): ObjetoJsonProtegido | undefined {
  const leitura = lerEsperaFluxo(contexto, noId);
  const esperas = lerObjeto(contexto[CHAVE_ESPERAS]);
  if (leitura.estado !== 'PRESENTE' || esperas === undefined) return undefined;
  const restantes = Object.fromEntries(
    Object.entries(esperas).filter(([chave]) => chave !== noId),
  );
  const semEsperas = { ...contexto };
  Reflect.deleteProperty(semEsperas, CHAVE_ESPERAS);
  return Object.keys(restantes).length === 0
    ? semEsperas
    : { ...semEsperas, [CHAVE_ESPERAS]: restantes };
}

function ehTipoEspera(valor: unknown): valor is TipoEsperaFluxo {
  return valor === 'ATE_INSTANTE' || valor === 'RESPOSTA';
}

function ehDataHoraCanonica(valor: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(valor) &&
    Number.isFinite(Date.parse(valor)) &&
    new Date(valor).toISOString() === valor
  );
}

function lerObjeto(
  valor: ValorJsonProtegido | undefined,
): ObjetoJsonProtegido | undefined {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? valor
    : undefined;
}

function temExatamenteChaves(
  valor: ObjetoJsonProtegido,
  chaves: readonly string[],
): boolean {
  return (
    Object.keys(valor).length === chaves.length &&
    Object.keys(valor).every((chave) => chaves.includes(chave))
  );
}
