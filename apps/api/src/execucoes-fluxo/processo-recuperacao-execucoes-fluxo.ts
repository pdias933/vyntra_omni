import { Inject, Injectable, Logger } from '@nestjs/common';

import { ServicoRecuperacaoExecucoesFluxo } from './servico-recuperacao-execucoes-fluxo.js';

const INTERVALO_PADRAO_MS = 1_000;

@Injectable()
export class ProcessoRecuperacaoExecucoesFluxo {
  private readonly logger = new Logger(ProcessoRecuperacaoExecucoesFluxo.name);

  public constructor(
    @Inject(ServicoRecuperacaoExecucoesFluxo)
    private readonly recuperacao: ServicoRecuperacaoExecucoesFluxo,
  ) {}

  public async executar(continuar: () => boolean): Promise<void> {
    const intervaloMs = this.obterIntervalo();
    while (continuar()) {
      try {
        const quantidade = await this.recuperacao.executarCiclo();
        if (quantidade >= 50) continue;
      } catch {
        this.logger.error('CICLO_RECUPERACAO_EXECUCOES_FLUXO_FALHOU');
      }
      await this.aguardarIntervalo(intervaloMs);
    }
  }

  private obterIntervalo(): number {
    const recebido = process.env.INTERVALO_VARREDURA_FLUXOS_MS;
    if (recebido === undefined) return INTERVALO_PADRAO_MS;
    const intervalo = Number(recebido);
    if (!Number.isInteger(intervalo) || intervalo < 100 || intervalo > 60_000) {
      throw new Error('INTERVALO_VARREDURA_FLUXOS_INVALIDO');
    }
    return intervalo;
  }

  private async aguardarIntervalo(intervaloMs: number): Promise<void> {
    await new Promise<void>((resolver) => {
      setTimeout(resolver, intervaloMs);
    });
  }
}
