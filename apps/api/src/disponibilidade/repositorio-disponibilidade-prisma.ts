import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { DisponibilidadeUsuarioPersistida } from './modelo-disponibilidade.js';
import type { RepositorioDisponibilidade } from './repositorio-disponibilidade.js';

@Injectable()
export class RepositorioDisponibilidadePrisma implements RepositorioDisponibilidade {
  public async bloquearUsuario(usuarioId: string, transacao: TransacaoPrisma): Promise<void> {
    await transacao.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`disponibilidade\u0000${usuarioId}`}, 0))`);
  }

  public async usuarioEstaAtivo(usuarioId: string, transacao: TransacaoPrisma): Promise<boolean> {
    return (await transacao.usuario.findFirst({ select: { id: true }, where: { estado: 'ATIVO', id: usuarioId } })) !== null;
  }

  public async obter(usuarioId: string, transacao: TransacaoPrisma): Promise<DisponibilidadeUsuarioPersistida | undefined> {
    return (await transacao.disponibilidadeUsuario.findUnique({ where: { usuarioId } })) ?? undefined;
  }

  public async criar(disponibilidade: DisponibilidadeUsuarioPersistida, transacao: TransacaoPrisma): Promise<boolean> {
    const resultado = await transacao.disponibilidadeUsuario.createMany({ data: disponibilidade, skipDuplicates: true });
    return resultado.count === 1;
  }

  public async alterar(disponibilidade: DisponibilidadeUsuarioPersistida, versaoEsperada: number, transacao: TransacaoPrisma): Promise<boolean> {
    const resultado = await transacao.disponibilidadeUsuario.updateMany({ data: disponibilidade, where: { usuarioId: disponibilidade.usuarioId, versao: versaoEsperada } });
    return resultado.count === 1;
  }
}

