import { Inject, Injectable } from '@nestjs/common';

import type {
  ContextoUsuarioAutorizacao,
} from './modelo-autorizacao.js';
import type { RepositorioAutorizacao } from './repositorio-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

@Injectable()
export class RepositorioAutorizacaoPrisma implements RepositorioAutorizacao {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async obterContexto(
    usuarioId: string,
    filaId?: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContextoUsuarioAutorizacao | undefined> {
    const contexto = transacao ?? (await this.prisma.obterCliente());
    const [usuario, fila, acessoFila] = await Promise.all([
      contexto.usuario.findUnique({
        select: {
          estado: true,
          perfil: {
            select: {
              estado: true,
              papelBase: true,
              permissoes: {
                select: { codigo: true, efeito: true },
              },
            },
          },
        },
        where: { id: usuarioId },
      }),
      filaId === undefined
        ? Promise.resolve(undefined)
        : contexto.fila.findUnique({
            select: { estado: true },
            where: { id: filaId },
          }),
      filaId === undefined
        ? Promise.resolve(undefined)
        : contexto.acessoUsuarioFila.findUnique({
            select: { estado: true },
            where: { usuarioId_filaId: { filaId, usuarioId } },
          }),
    ]);

    if (usuario === null) {
      return undefined;
    }

    return {
      acessoFilaAtivo: acessoFila?.estado === 'ATIVO',
      ajustes:
        usuario.perfil?.permissoes.map(({ codigo, efeito }) => ({
          codigo,
          efeito,
        })) ?? [],
      filaAtiva: fila?.estado === 'ATIVA',
      papelBase: usuario.perfil?.papelBase,
      perfilAtivo: usuario.perfil?.estado === 'ATIVO',
      usuarioAtivo: usuario.estado === 'ATIVO',
    };
  }
}
