import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import type { SnapshotSincronizacaoCompleta } from './modelo-sincronizacao.js';
import {
  REPOSITORIO_RESSINCRONIZACAO,
  type RepositorioRessincronizacao,
} from './repositorio-ressincronizacao.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoRessincronizacaoCompleta {
  public constructor(
    @Inject(REPOSITORIO_RESSINCRONIZACAO)
    private readonly repositorio: RepositorioRessincronizacao,
  ) {}

  public async reconstruir(
    sessao: ContextoSessaoAutorizacao,
    relogio: () => Date = () => new Date(),
  ): Promise<SnapshotSincronizacaoCompleta> {
    const agora = relogio();
    if (
      !UUID.test(sessao.sessaoId) ||
      !UUID.test(sessao.usuarioId) ||
      sessao.estado !== 'ATIVA' ||
      !Number.isFinite(agora.getTime()) ||
      !Number.isFinite(sessao.expiraEm.getTime()) ||
      sessao.expiraEm <= agora
    ) {
      throw new ErroNaoAutenticado();
    }
    const snapshot = await this.repositorio.criarSnapshotAutorizado(
      sessao.usuarioId,
      agora,
    );
    if (snapshot === undefined) throw new ErroNaoAutenticado();
    return snapshot;
  }
}
