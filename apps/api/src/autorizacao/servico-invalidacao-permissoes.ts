import { Inject, Injectable } from '@nestjs/common';

import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  REPOSITORIO_INVALIDACAO_PERMISSOES,
  type RepositorioInvalidacaoPermissoes,
} from './repositorio-invalidacao-permissoes.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MOTIVOS = new Set([
  'ACESSO_FILA_CONCEDIDO',
  'ACESSO_FILA_REVOGADO',
  'FILA_INATIVADA',
  'PERFIL_ALTERADO',
]);

export interface EntradaInvalidacaoPermissoes {
  readonly filaId?: string;
  readonly motivo:
    | 'ACESSO_FILA_CONCEDIDO'
    | 'ACESSO_FILA_REVOGADO'
    | 'FILA_INATIVADA'
    | 'PERFIL_ALTERADO';
  readonly usuarioAlvoId: string;
  readonly usuarioAtorId: string;
}

@Injectable()
export class ServicoInvalidacaoPermissoes {
  public constructor(
    @Inject(REPOSITORIO_INVALIDACAO_PERMISSOES)
    private readonly repositorio: RepositorioInvalidacaoPermissoes,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
  ) {}

  public async registrar(
    entrada: EntradaInvalidacaoPermissoes,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    if (
      !UUID.test(entrada.usuarioAlvoId) ||
      !UUID.test(entrada.usuarioAtorId) ||
      (entrada.filaId !== undefined && !UUID.test(entrada.filaId)) ||
      !MOTIVOS.has(entrada.motivo)
    ) {
      throw new Error('INVALIDACAO_PERMISSOES_INVALIDA');
    }
    const versao = await this.repositorio.incrementarVersao(
      entrada.usuarioAlvoId,
      transacao,
    );
    if (versao === undefined || !Number.isInteger(versao) || versao < 2) {
      throw new Error('USUARIO_INVALIDACAO_PERMISSOES_INDISPONIVEL');
    }
    await this.eventos.acrescentar(
      {
        classificacaoDados: 'OPERACIONAL',
        dados: {
          ...(entrada.filaId === undefined ? {} : { filaId: entrada.filaId }),
          tipo: entrada.motivo,
          versaoPermissoes: versao,
        },
        entidadeId: entrada.usuarioAlvoId,
        entidadeTipo: 'USUARIO',
        tipo: 'PERMISSOES_ALTERADAS',
        usuarioAtorId: entrada.usuarioAtorId,
      },
      transacao,
    );
    return versao;
  }
}
