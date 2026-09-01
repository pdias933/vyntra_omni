import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from '../seguranca/modelo-dados-protegidos.js';
import type { SnapshotClientePersistido } from './modelo-snapshot-cliente.js';
import type { RepositorioSnapshotsCliente } from './repositorio-snapshots-cliente.js';

@Injectable()
export class RepositorioSnapshotsClientePrisma
  implements RepositorioSnapshotsCliente
{
  public async bloquearVinculo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`snapshot:${vinculoClienteId}`}, 0))`,
    );
  }

  public async vinculoEstaAtivo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const vinculo = await transacao.vinculoCliente.findFirst({
      select: { id: true },
      where: { id: vinculoClienteId, revogadoEm: null },
    });
    return vinculo !== null;
  }

  public async obterPorVinculo(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<SnapshotClientePersistido | undefined> {
    const snapshot = await transacao.snapshotCliente.findUnique({
      where: { vinculoClienteId },
    });
    if (snapshot === null) return undefined;
    if (!this.ehObjetoJsonProtegido(snapshot.dadosProtegidos)) {
      throw new Error('DADOS_SNAPSHOT_CLIENTE_INCONSISTENTES');
    }
    return {
      atualizadoEm: snapshot.atualizadoEm,
      capturadoEm: snapshot.capturadoEm,
      conteudoHash: snapshot.conteudoHash,
      dadosProtegidos: snapshot.dadosProtegidos,
      estado: snapshot.estado,
      id: snapshot.id,
      ...(snapshot.motivoObsolescencia === null
        ? {}
        : { motivoObsolescencia: snapshot.motivoObsolescencia }),
      ...(snapshot.obsoletoEm === null
        ? {}
        : { obsoletoEm: snapshot.obsoletoEm }),
      origem: snapshot.origem,
      persistidoEm: snapshot.persistidoEm,
      versao: snapshot.versao,
      vinculoClienteId: snapshot.vinculoClienteId,
    };
  }

  public async criar(
    snapshot: SnapshotClientePersistido,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.snapshotCliente.create({ data: this.dados(snapshot) });
  }

  public async atualizar(
    snapshot: SnapshotClientePersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.snapshotCliente.updateMany({
      data: this.dados(snapshot),
      where: {
        id: snapshot.id,
        versao: versaoEsperada,
        vinculoClienteId: snapshot.vinculoClienteId,
      },
    });
    return resultado.count === 1;
  }

  private dados(snapshot: SnapshotClientePersistido) {
    return {
      atualizadoEm: snapshot.atualizadoEm,
      capturadoEm: snapshot.capturadoEm,
      conteudoHash: snapshot.conteudoHash,
      dadosProtegidos: snapshot.dadosProtegidos,
      estado: snapshot.estado,
      id: snapshot.id,
      motivoObsolescencia: snapshot.motivoObsolescencia ?? null,
      obsoletoEm: snapshot.obsoletoEm ?? null,
      origem: snapshot.origem,
      persistidoEm: snapshot.persistidoEm,
      versao: snapshot.versao,
      vinculoClienteId: snapshot.vinculoClienteId,
    };
  }

  private ehObjetoJsonProtegido(valor: unknown): valor is ObjetoJsonProtegido {
    return (
      valor !== null &&
      typeof valor === 'object' &&
      !Array.isArray(valor) &&
      Object.values(valor).every((item) => this.ehValorJsonProtegido(item, 0))
    );
  }

  private ehValorJsonProtegido(
    valor: unknown,
    profundidade: number,
  ): valor is ValorJsonProtegido {
    if (profundidade > 6) return false;
    if (
      valor === null ||
      typeof valor === 'boolean' ||
      typeof valor === 'string'
    ) {
      return true;
    }
    if (typeof valor === 'number') return Number.isFinite(valor);
    if (Array.isArray(valor)) {
      return valor.every((item) =>
        this.ehValorJsonProtegido(item, profundidade + 1),
      );
    }
    return (
      typeof valor === 'object' &&
      Object.values(valor).every((item) =>
        this.ehValorJsonProtegido(item, profundidade + 1),
      )
    );
  }
}
