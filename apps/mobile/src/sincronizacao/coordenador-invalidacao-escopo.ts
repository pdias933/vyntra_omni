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
  invalidarReplicaLocal(evento: EventoInvalidacaoEscopoMobile): Promise<void>;
  obterSnapshotAutorizado(
    evento: EventoInvalidacaoEscopoMobile,
  ): Promise<Snapshot>;
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
  private eventoPendente: EventoInvalidacaoEscopoMobile | undefined;

  public constructor(
    private readonly executor: ExecutorInvalidacaoEscopoMobile<Snapshot>,
  ) {}

  public invalidar(evento: EventoInvalidacaoEscopoMobile): Promise<void> {
    this.validarEvento(evento);
    if (
      this.eventoPendente === undefined ||
      BigInt(evento.sequenciaEvento) >
        BigInt(this.eventoPendente.sequenciaEvento)
    ) {
      this.eventoPendente = evento;
    }
    this.invalidacaoEmCurso ??= this.executarPendentes().finally(() => {
      this.invalidacaoEmCurso = undefined;
    });
    return this.invalidacaoEmCurso;
  }

  private async executarPendentes(): Promise<void> {
    while (this.eventoPendente !== undefined) {
      const evento = this.eventoPendente;
      this.eventoPendente = undefined;
      await this.executar(evento);
    }
  }

  private async executar(evento: EventoInvalidacaoEscopoMobile): Promise<void> {
    await this.executor.pausarComandosDependentes();
    try {
      await this.executor.invalidarReplicaLocal(evento);
      await this.executor.fecharTempoReal();
      const snapshot = await this.executor.obterSnapshotAutorizado(evento);
      if (
        snapshot.versaoPermissoes < evento.dados.versaoPermissoes ||
        BigInt(snapshot.sequenciaBase) < BigInt(evento.sequenciaEvento)
      ) {
        throw new Error('SNAPSHOT_ESCOPO_DESATUALIZADO');
      }
      await this.executor.substituirReplicaRemovendoAusentes(snapshot);
      await this.executor.abrirTempoReal(snapshot.sequenciaBase);
      await this.executor.reconciliarPendencias();
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
