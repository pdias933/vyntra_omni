import { AsyncLocalStorage } from 'node:async_hooks';

export interface RastreioTecnico {
  readonly spanId: string;
  readonly traceId: string;
}

export class ContextoRastreio {
  private readonly armazenamento = new AsyncLocalStorage<RastreioTecnico>();

  public executar<T>(rastreio: RastreioTecnico, operacao: () => T): T {
    return this.armazenamento.run(rastreio, operacao);
  }

  public obter(): RastreioTecnico | undefined {
    return this.armazenamento.getStore();
  }
}

export const contextoRastreio = new ContextoRastreio();
