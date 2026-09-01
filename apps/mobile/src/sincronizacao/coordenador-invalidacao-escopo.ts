const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface EventoInvalidacaoEscopoMobile {
  readonly dados: Readonly<{
    readonly versaoPermissoes: number;
  }>;
  readonly entidadeId: string;
  readonly sequenciaEvento: string;
  readonly tipo: 'PERMISSOES_ALTERADAS';
}

export interface SnapshotAutorizadoMobile {
  readonly sequenciaBase: string;
  readonly versaoPermissoes: number;
}

export interface ExecutorInvalidacaoEscopoMobile<
  Snapshot extends SnapshotAutorizadoMobile,
> {
  bloquearAreaAutenticada(): Promise<void>;
  fecharTempoReal(): Promise<void>;
  obterSnapshotAutorizado(): Promise<Snapshot>;
  abrirTempoReal(apos: string): Promise<void>;
  pausarComandosDependentes(): Promise<void>;
  reconciliarPendencias(): Promise<void>;
  retomarComandosAutorizados(): Promise<void>;
  substituirReplicaRemovendoAusentes(snapshot: Snapshot): Promise<void>;
}

export class CoordenadorInvalidacaoEscopoMobile<
  Snapshot extends SnapshotAutorizadoMobile,
> {
  private invalidacaoEmCurso: Promise<void> | undefined;

  public constructor(
    private readonly executor: ExecutorInvalidacaoEscopoMobile<Snapshot>,
  ) {}

  public invalidar(evento: EventoInvalidacaoEscopoMobile): Promise<void> {
    this.validarEvento(evento);
    this.invalidacaoEmCurso ??= this.executar(evento).finally(() => {
      this.invalidacaoEmCurso = undefined;
    });
    return this.invalidacaoEmCurso;
  }

  private async executar(
    evento: EventoInvalidacaoEscopoMobile,
  ): Promise<void> {
    await this.executor.pausarComandosDependentes();
    try {
      await this.executor.fecharTempoReal();
      const snapshot = await this.executor.obterSnapshotAutorizado();
      if (
        snapshot.versaoPermissoes < evento.dados.versaoPermissoes ||
        BigInt(snapshot.sequenciaBase) < BigInt(evento.sequenciaEvento)
      ) {
        throw new Error('SNAPSHOT_ESCOPO_DESATUALIZADO');
      }
      await this.executor.substituirReplicaRemovendoAusentes(snapshot);
      await this.executor.reconciliarPendencias();
      await this.executor.abrirTempoReal(snapshot.sequenciaBase);
      await this.executor.retomarComandosAutorizados();
    } catch (erro) {
      await this.executor.bloquearAreaAutenticada();
      throw erro;
    }
  }

  private validarEvento(evento: EventoInvalidacaoEscopoMobile): void {
    if (
      evento.tipo !== 'PERMISSOES_ALTERADAS' ||
      !UUID.test(evento.entidadeId) ||
      !/^[1-9][0-9]{0,18}$/u.test(evento.sequenciaEvento) ||
      !Number.isInteger(evento.dados?.versaoPermissoes) ||
      evento.dados.versaoPermissoes < 2
    ) {
      throw new Error('EVENTO_INVALIDACAO_ESCOPO_INVALIDO');
    }
  }
}
