import type { SnapshotSincronizacaoCompleta } from './modelo-sincronizacao.js';

export interface EstadoLocalPreservado {
  readonly rascunhos: readonly { readonly conversaId: string; readonly texto: string }[];
  readonly comandosPendentes: readonly { readonly chave: string; readonly tipo: string }[];
}

export interface PlanoAplicacaoSnapshot {
  readonly operacoesAtomicas: readonly [
    'SUBSTITUIR_REPLICA_AUTORIZADA',
    'PERSISTIR_SEQUENCIA_BASE',
  ];
  readonly sequenciaBase: string;
  readonly versaoPermissoes: number;
  readonly preservar: EstadoLocalPreservado;
}

export class PlanejadorAplicacaoSnapshot {
  public planejar(
    snapshot: SnapshotSincronizacaoCompleta,
    estadoLocal: EstadoLocalPreservado,
  ): PlanoAplicacaoSnapshot {
    if (
      !/^(0|[1-9][0-9]{0,18})$/u.test(snapshot.sequenciaBase) ||
      !Number.isInteger(snapshot.versaoPermissoes) ||
      snapshot.versaoPermissoes < 1
    ) {
      throw new Error('SNAPSHOT_SINCRONIZACAO_INVALIDO');
    }
    return {
      operacoesAtomicas: [
        'SUBSTITUIR_REPLICA_AUTORIZADA',
        'PERSISTIR_SEQUENCIA_BASE',
      ],
      preservar: {
        comandosPendentes: [...estadoLocal.comandosPendentes],
        rascunhos: [...estadoLocal.rascunhos],
      },
      sequenciaBase: snapshot.sequenciaBase,
      versaoPermissoes: snapshot.versaoPermissoes,
    };
  }
}
