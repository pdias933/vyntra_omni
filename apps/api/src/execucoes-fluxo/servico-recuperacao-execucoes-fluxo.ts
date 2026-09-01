import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import { ErroExecucaoFluxoInvalida } from './erros-execucao-fluxo.js';
import {
  REPOSITORIO_EXECUCOES_FLUXO,
  type RepositorioExecucoesFluxo,
} from './repositorio-execucoes-fluxo.js';
import { ServicoExecucoesFluxo } from './servico-execucoes-fluxo.js';

@Injectable()
export class ServicoRecuperacaoExecucoesFluxo {
  public constructor(
    @Inject(REPOSITORIO_EXECUCOES_FLUXO)
    private readonly repositorio: RepositorioExecucoesFluxo,
    @Inject(ServicoExecucoesFluxo)
    private readonly execucoes: ServicoExecucoesFluxo,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
  ) {}

  public async executarCiclo(
    limite = 50,
    relogio: () => Date = () => new Date(),
  ): Promise<number> {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return this.prisma.executarTransacao(async (transacao) => {
      const vencidas = await this.repositorio.listarRetomadasVencidas(
        limite,
        agora,
        transacao,
      );
      for (const execucao of vencidas) {
        await this.execucoes.transitar(
          {
            comando: { tipo: 'RETOMAR' },
            execucaoFluxoId: execucao.id,
            revisaoEsperada: execucao.revisao,
          },
          transacao,
          () => agora,
        );
      }
      return vencidas.length;
    });
  }
}
