import type { AvisoMobileRecebido } from './modelo-aviso-mobile';

const LIMITE_GRUPOS = 100;

export interface GrupoAvisosMobile {
  readonly aviso: AvisoMobileRecebido;
  readonly quantidade: number;
  readonly recebidoEm: string;
}

export class CaixaAvisosMobile {
  private readonly grupos = new Map<string, GrupoAvisosMobile>();
  private readonly observadores = new Set<() => void>();

  public listar(): readonly GrupoAvisosMobile[] {
    return [...this.grupos.values()].sort((a, b) => {
      const diferenca =
        BigInt(b.aviso.sequenciaObservada) -
        BigInt(a.aviso.sequenciaObservada);
      return diferenca === 0n ? 0 : diferenca > 0n ? 1 : -1;
    });
  }

  public observar(observador: () => void): () => void {
    this.observadores.add(observador);
    return () => this.observadores.delete(observador);
  }

  public registrar(aviso: AvisoMobileRecebido, agora = new Date()): void {
    const atual = this.grupos.get(aviso.chaveAgrupamento);
    if (
      atual !== undefined &&
      BigInt(atual.aviso.sequenciaObservada) >=
        BigInt(aviso.sequenciaObservada)
    ) {
      return;
    }
    this.grupos.delete(aviso.chaveAgrupamento);
    this.grupos.set(aviso.chaveAgrupamento, {
      aviso,
      quantidade: (atual?.quantidade ?? 0) + 1,
      recebidoEm: agora.toISOString(),
    });
    while (this.grupos.size > LIMITE_GRUPOS) {
      const primeira = this.grupos.keys().next().value as string | undefined;
      if (primeira === undefined) break;
      this.grupos.delete(primeira);
    }
    this.publicar();
  }

  public remover(chaveAgrupamento: string, sequenciaAte?: string): void {
    const atual = this.grupos.get(chaveAgrupamento);
    if (
      atual === undefined ||
      (sequenciaAte !== undefined &&
        BigInt(atual.aviso.sequenciaObservada) > BigInt(sequenciaAte))
    ) {
      return;
    }
    if (!this.grupos.delete(chaveAgrupamento)) return;
    this.publicar();
  }

  public limpar(): void {
    if (this.grupos.size === 0) return;
    this.grupos.clear();
    this.publicar();
  }

  private publicar(): void {
    for (const observador of this.observadores) observador();
  }
}
