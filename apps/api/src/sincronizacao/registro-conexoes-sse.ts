import { Injectable, type OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class RegistroConexoesSse implements OnModuleDestroy {
  private readonly encerramentos = new Set<() => void>();

  public registrar(encerrar: () => void): () => void {
    this.encerramentos.add(encerrar);
    return () => this.encerramentos.delete(encerrar);
  }

  public onModuleDestroy(): void {
    for (const encerrar of this.encerramentos) encerrar();
    this.encerramentos.clear();
  }
}
