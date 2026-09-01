export const ESTADOS_OBSERVACAO_CAPACIDADE_META = [
  'NAO_OBSERVADA',
  'HABILITADA',
  'DESABILITADA',
] as const;

export type EstadoObservacaoCapacidadeMeta =
  (typeof ESTADOS_OBSERVACAO_CAPACIDADE_META)[number];

export interface CaracterizacaoMetaCloud {
  readonly graphApiVersion: string;
  readonly observadaEm: string;
  readonly origemEvidencia: 'CONTA_REAL' | 'FIXTURE_SANITIZADA';
  readonly identificacao: {
    readonly bsuid: EstadoObservacaoCapacidadeMeta;
    readonly username: EstadoObservacaoCapacidadeMeta;
    readonly telefoneOpcional: true;
  };
  readonly capacidades: {
    readonly flows: EstadoObservacaoCapacidadeMeta;
    readonly reactions: EstadoObservacaoCapacidadeMeta;
    readonly replyContext: EstadoObservacaoCapacidadeMeta;
    readonly urlPreview: EstadoObservacaoCapacidadeMeta;
  };
  readonly limites: {
    readonly throughputMensagensPorSegundo: number | 'NAO_OBSERVADO';
  };
}

const VERSAO_GRAPH = /^v[1-9][0-9]*\.0$/u;

export class ValidadorCaracterizacaoMetaCloud {
  public validar(entrada: CaracterizacaoMetaCloud): CaracterizacaoMetaCloud {
    if (
      !VERSAO_GRAPH.test(entrada.graphApiVersion) ||
      !Number.isFinite(Date.parse(entrada.observadaEm)) ||
      entrada.identificacao.telefoneOpcional !== true ||
      !Object.values(entrada.identificacao)
        .filter((valor) => typeof valor === 'string')
        .every((valor) => this.estadoValido(valor)) ||
      !Object.values(entrada.capacidades).every((valor) => this.estadoValido(valor)) ||
      !this.throughputValido(entrada.limites.throughputMensagensPorSegundo)
    ) {
      throw new Error('CARACTERIZACAO_META_CLOUD_INVALIDA');
    }
    if (
      entrada.origemEvidencia === 'CONTA_REAL' &&
      Object.values(entrada.capacidades).includes('NAO_OBSERVADA')
    ) {
      throw new Error('CARACTERIZACAO_META_CLOUD_INCOMPLETA');
    }
    return structuredClone(entrada);
  }

  public podeAtivarIntegracao(entrada: CaracterizacaoMetaCloud): boolean {
    const validada = this.validar(entrada);
    return (
      validada.origemEvidencia === 'CONTA_REAL' &&
      validada.identificacao.bsuid !== 'NAO_OBSERVADA' &&
      validada.limites.throughputMensagensPorSegundo !== 'NAO_OBSERVADO'
    );
  }

  private estadoValido(valor: unknown): valor is EstadoObservacaoCapacidadeMeta {
    return (
      typeof valor === 'string' &&
      ESTADOS_OBSERVACAO_CAPACIDADE_META.includes(
        valor as EstadoObservacaoCapacidadeMeta,
      )
    );
  }

  private throughputValido(valor: number | 'NAO_OBSERVADO'): boolean {
    return (
      valor === 'NAO_OBSERVADO' ||
      (Number.isInteger(valor) && valor > 0 && valor <= 10_000)
    );
  }
}
