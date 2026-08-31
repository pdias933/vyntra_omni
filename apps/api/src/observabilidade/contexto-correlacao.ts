import { AsyncLocalStorage } from 'node:async_hooks';

export class ContextoCorrelacao {
  private readonly armazenamento = new AsyncLocalStorage<string>();

  public executar<T>(correlacaoId: string, operacao: () => T): T {
    return this.armazenamento.run(correlacaoId, operacao);
  }

  public obter(): string | undefined {
    return this.armazenamento.getStore();
  }
}

export const contextoCorrelacao = new ContextoCorrelacao();
