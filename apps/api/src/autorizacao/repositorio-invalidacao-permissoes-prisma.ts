import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { RepositorioInvalidacaoPermissoes } from './repositorio-invalidacao-permissoes.js';

interface LinhaVersaoPermissoes {
  readonly versao_permissoes: number;
}

@Injectable()
export class RepositorioInvalidacaoPermissoesPrisma
  implements RepositorioInvalidacaoPermissoes
{
  public async incrementarVersao(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<number | undefined> {
    const [linha] = await transacao.$queryRaw<LinhaVersaoPermissoes[]>(
      Prisma.sql`
        UPDATE "usuario"
        SET "versao_permissoes"="versao_permissoes"+1,
            "atualizado_em"=now()
        WHERE "id"=${usuarioId}::uuid AND "estado"='ATIVO'
        RETURNING "versao_permissoes"
      `,
    );
    return linha?.versao_permissoes;
  }
}
