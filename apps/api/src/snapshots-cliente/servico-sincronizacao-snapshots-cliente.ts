import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroSnapshotClienteInvalido } from './erros-snapshot-cliente.js';
import type { EntradaAtualizacaoSnapshotCliente } from './modelo-snapshot-cliente.js';
import { ServicoSnapshotsCliente } from './servico-snapshots-cliente.js';

const LIMITE_LOTE = 100;

export type AlteracaoIncrementalSnapshotCliente =
  | {
      readonly tipo: 'ATUALIZAR';
      readonly snapshot: EntradaAtualizacaoSnapshotCliente;
    }
  | {
      readonly tipo: 'EXCLUIR';
      readonly vinculoClienteId: string;
      readonly evidenciadaEm: Date;
      readonly evidencia: 'TOMBSTONE_ERP';
    };

export interface EntradaReconciliacaoCompletaSnapshotsCliente {
  readonly confirmadaCompleta: true;
  readonly snapshots: readonly EntradaAtualizacaoSnapshotCliente[];
  readonly ausenciasConfirmadas: readonly {
    readonly vinculoClienteId: string;
    readonly evidenciadaEm: Date;
  }[];
}

export interface ResultadoLoteSincronizacaoSnapshotsCliente {
  readonly atualizados: number;
  readonly repetidos: number;
  readonly ignorados: number;
  readonly obsoletos: number;
}

@Injectable()
export class ServicoSincronizacaoSnapshotsCliente {
  public constructor(
    @Inject(ServicoSnapshotsCliente)
    private readonly snapshots: ServicoSnapshotsCliente,
  ) {}

  public async aplicarIncremental(
    alteracoes: readonly AlteracaoIncrementalSnapshotCliente[],
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoLoteSincronizacaoSnapshotsCliente> {
    this.validarQuantidade(alteracoes.length);
    const ids = alteracoes.map((alteracao) =>
      alteracao.tipo === 'ATUALIZAR'
        ? alteracao.snapshot.vinculoClienteId
        : alteracao.vinculoClienteId,
    );
    this.validarIdsUnicos(ids);
    const resultado = this.resultadoVazio();
    for (const alteracao of alteracoes) {
      if (alteracao.tipo === 'ATUALIZAR') {
        this.contabilizarAtualizacao(
          resultado,
          await this.snapshots.atualizar(
            alteracao.snapshot,
            transacao,
            relogio,
          ),
        );
      } else {
        if (alteracao.evidencia !== 'TOMBSTONE_ERP') {
          throw new ErroSnapshotClienteInvalido();
        }
        this.contabilizarObsolescencia(
          resultado,
          await this.snapshots.marcarObsolescencia(
            {
              evidenciadaEm: alteracao.evidenciadaEm,
              motivo: 'TOMBSTONE_ERP',
              vinculoClienteId: alteracao.vinculoClienteId,
            },
            transacao,
            relogio,
          ),
        );
      }
    }
    return resultado;
  }

  public async aplicarReconciliacaoCompleta(
    entrada: EntradaReconciliacaoCompletaSnapshotsCliente,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoLoteSincronizacaoSnapshotsCliente> {
    if (entrada.confirmadaCompleta !== true) {
      throw new ErroSnapshotClienteInvalido();
    }
    this.validarQuantidade(
      entrada.snapshots.length + entrada.ausenciasConfirmadas.length,
    );
    this.validarIdsUnicos([
      ...entrada.snapshots.map((snapshot) => snapshot.vinculoClienteId),
      ...entrada.ausenciasConfirmadas.map((item) => item.vinculoClienteId),
    ]);
    const resultado = this.resultadoVazio();
    for (const snapshot of entrada.snapshots) {
      this.contabilizarAtualizacao(
        resultado,
        await this.snapshots.atualizar(snapshot, transacao, relogio),
      );
    }
    for (const ausencia of entrada.ausenciasConfirmadas) {
      this.contabilizarObsolescencia(
        resultado,
        await this.snapshots.marcarObsolescencia(
          {
            evidenciadaEm: ausencia.evidenciadaEm,
            motivo: 'AUSENTE_RECONCILIACAO_COMPLETA',
            vinculoClienteId: ausencia.vinculoClienteId,
          },
          transacao,
          relogio,
        ),
      );
    }
    return resultado;
  }

  private resultadoVazio(): {
    atualizados: number;
    repetidos: number;
    ignorados: number;
    obsoletos: number;
  } {
    return { atualizados: 0, ignorados: 0, obsoletos: 0, repetidos: 0 };
  }

  private contabilizarAtualizacao(
    resultado: ReturnType<ServicoSincronizacaoSnapshotsCliente['resultadoVazio']>,
    item: Awaited<ReturnType<ServicoSnapshotsCliente['atualizar']>>,
  ): void {
    if (item.situacao === 'ATUALIZADO') resultado.atualizados += 1;
    else if (item.situacao === 'REPETIDO') resultado.repetidos += 1;
    else resultado.ignorados += 1;
  }

  private contabilizarObsolescencia(
    resultado: ReturnType<ServicoSincronizacaoSnapshotsCliente['resultadoVazio']>,
    item: Awaited<ReturnType<ServicoSnapshotsCliente['marcarObsolescencia']>>,
  ): void {
    if (item.situacao === 'ATUALIZADO') resultado.obsoletos += 1;
    else if (item.situacao === 'REPETIDO') resultado.repetidos += 1;
    else resultado.ignorados += 1;
  }

  private validarQuantidade(quantidade: number): void {
    if (quantidade < 1 || quantidade > LIMITE_LOTE) {
      throw new ErroSnapshotClienteInvalido();
    }
  }

  private validarIdsUnicos(ids: readonly string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new ErroSnapshotClienteInvalido();
    }
  }
}
