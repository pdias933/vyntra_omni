import { Inject, Injectable, Logger } from '@nestjs/common';

import { ServicoRecuperacaoExecucoesFluxo } from './servico-recuperacao-execucoes-fluxo.js';
import { ServicoExecutorNosFluxo } from './servico-executor-nos-fluxo.js';

const INTERVALO_PADRAO_MS = 1_000;

@Injectable()
export class ProcessoRecuperacaoExecucoesFluxo {
  private readonly logger = new Logger(ProcessoRecuperacaoExecucoesFluxo.name);
  private continuar = true;
  private acordar: (() => void) | undefined;

  public constructor(
    @Inject(ServicoRecuperacaoExecucoesFluxo)
    private readonly recuperacao: ServicoRecuperacaoExecucoesFluxo,
    @Inject(ServicoExecutorNosFluxo)
    private readonly executor: ServicoExecutorNosFluxo,
  ) {}

  public async executar(): Promise<void> {
    const intervaloMs = this.obterIntervalo();
    while (this.continuar) {
      try {
        const recuperadas = await this.recuperacao.executarCiclo();
        const executadas = await this.executor.executarCiclo();
        if (recuperadas >= 50 || executadas >= 50) continue;
      } catch {
        this.logger.error('CICLO_WORKER_EXECUCOES_FLUXO_FALHOU');
      }
      await this.aguardarIntervalo(intervaloMs);
    }
  }

  public solicitarDrenagem(): void {
    this.continuar = false;
    this.acordar?.();
    this.acordar = undefined;
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
      const temporizador = setTimeout(() => {
        this.acordar = undefined;
        resolver();
      }, intervaloMs);
      this.acordar = () => {
        clearTimeout(temporizador);
        resolver();
      };
    });
  }
}
