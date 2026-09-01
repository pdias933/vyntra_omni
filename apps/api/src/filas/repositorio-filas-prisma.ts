import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AcessoUsuarioFilaPersistido,
  FilaPersistida,
} from './modelo-fila.js';
import type { RepositorioFilas } from './repositorio-filas.js';

@Injectable()
export class RepositorioFilasPrisma implements RepositorioFilas {
  public async bloquearNome(
    nomeNormalizado: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`fila-nome\u0000${nomeNormalizado}`, transacao);
  }

  public async bloquearFila(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`fila\u0000${filaId}`, transacao);
  }

  public async bloquearVinculo(
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(`fila-vinculo\u0000${filaId}\u0000${usuarioId}`, transacao);
  }

  public async criarFila(
    fila: FilaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.fila.createMany({
      data: {
        atualizadoEm: fila.atualizadoEm,
        criadoEm: fila.criadoEm,
        estado: fila.estado,
        id: fila.id,
        inativadaEm: fila.inativadaEm ?? null,
        nome: fila.nome,
        nomeNormalizado: fila.nomeNormalizado,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async obterFila(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<FilaPersistida | undefined> {
    const fila = await transacao.fila.findUnique({ where: { id: filaId } });
    if (fila === null) return undefined;
    return {
      atualizadoEm: fila.atualizadoEm,
      criadoEm: fila.criadoEm,
      estado: fila.estado,
      id: fila.id,
      nome: fila.nome,
      nomeNormalizado: fila.nomeNormalizado,
      ...(fila.inativadaEm === null ? {} : { inativadaEm: fila.inativadaEm }),
    };
  }

  public async inativarFila(
    filaId: string,
    inativadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.fila.updateMany({
      data: { atualizadoEm: inativadaEm, estado: 'INATIVA', inativadaEm },
      where: { estado: 'ATIVA', id: filaId },
    });
    return resultado.count === 1;
  }

  public async usuarioEstaAtivo(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.usuario.findFirst({
        select: { id: true },
        where: { estado: 'ATIVO', id: usuarioId },
      })) !== null
    );
  }

  public async obterAcesso(
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<AcessoUsuarioFilaPersistido | undefined> {
    const acesso = await transacao.acessoUsuarioFila.findUnique({
      where: { usuarioId_filaId: { filaId, usuarioId } },
    });
    if (acesso === null) return undefined;
    return {
      criadoEm: acesso.criadoEm,
      estado: acesso.estado,
      filaId: acesso.filaId,
      usuarioId: acesso.usuarioId,
      ...(acesso.revogadoEm === null ? {} : { revogadoEm: acesso.revogadoEm }),
    };
  }

  public async listarUsuariosAfetadosFila(
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<readonly string[]> {
    const usuarios = await transacao.$queryRaw<Array<{ readonly id: string }>>(
      Prisma.sql`
        SELECT u."id"
        FROM "usuario" u
        JOIN "perfil_acesso" p
          ON p."id"=u."perfil_id" AND p."estado"='ATIVO'
        WHERE u."estado"='ATIVO'
          AND NOT EXISTS (
            SELECT 1 FROM "permissao_perfil" pp
            WHERE pp."perfil_id"=p."id"
              AND pp."codigo"='VISUALIZAR_FILA'
              AND pp."efeito"='NEGAR'
          )
          AND (
            p."papel_base"='ADMINISTRADOR'
            OR (
              (
                p."papel_base" IN ('SUPERVISOR','ATENDENTE')
                OR EXISTS (
                  SELECT 1 FROM "permissao_perfil" pp
                  WHERE pp."perfil_id"=p."id"
                    AND pp."codigo"='VISUALIZAR_FILA'
                    AND pp."efeito"='CONCEDER'
                )
              )
              AND EXISTS (
                SELECT 1 FROM "acesso_usuario_fila" auf
                WHERE auf."usuario_id"=u."id"
                  AND auf."fila_id"=${filaId}::uuid
                  AND auf."estado"='ATIVO'
              )
            )
          )
        ORDER BY u."id"
      `,
    );
    return usuarios.map(({ id }) => id);
  }

  public async concederAcesso(
    acesso: AcessoUsuarioFilaPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.acessoUsuarioFila.upsert({
      create: {
        criadoEm: acesso.criadoEm,
        estado: 'ATIVO',
        filaId: acesso.filaId,
        usuarioId: acesso.usuarioId,
      },
      update: {
        criadoEm: acesso.criadoEm,
        estado: 'ATIVO',
        revogadoEm: null,
      },
      where: {
        usuarioId_filaId: {
          filaId: acesso.filaId,
          usuarioId: acesso.usuarioId,
        },
      },
    });
  }

  public async revogarAcesso(
    filaId: string,
    usuarioId: string,
    revogadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.acessoUsuarioFila.updateMany({
      data: { estado: 'REVOGADO', revogadoEm },
      where: { estado: 'ATIVO', filaId, usuarioId },
    });
    return resultado.count === 1;
  }

  private async bloquear(
    chave: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`,
    );
  }
}
