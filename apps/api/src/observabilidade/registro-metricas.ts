export interface ResumoMetricasHttp {
  readonly duracaoMediaMs: number;
  readonly duracaoP95AproximadaMs: number;
  readonly falhas: number;
  readonly requisicoes: number;
}

const LIMITES_DURACAO_MS = [10, 50, 100, 250, 500, 1_000, 5_000] as const;

export class RegistroMetricasOperacionais {
  private requisicoes = 0;
  private falhas = 0;
  private somaDuracaoMs = 0;
  private readonly distribuicao = Array.from(
    { length: LIMITES_DURACAO_MS.length + 1 },
    () => 0,
  );

  public observarHttp(statusHttp: number, duracaoMs: number): void {
    if (
      !Number.isInteger(statusHttp) ||
      statusHttp < 100 ||
      statusHttp > 599 ||
      !Number.isFinite(duracaoMs) ||
      duracaoMs < 0
    ) {
      return;
    }
    this.requisicoes += 1;
    if (statusHttp >= 500) this.falhas += 1;
    this.somaDuracaoMs += duracaoMs;
    const indice = LIMITES_DURACAO_MS.findIndex(
      (limite) => duracaoMs <= limite,
    );
    const faixa = indice === -1 ? LIMITES_DURACAO_MS.length : indice;
    this.distribuicao[faixa] = (this.distribuicao[faixa] ?? 0) + 1;
  }

  public resumirHttp(): ResumoMetricasHttp {
    const alvoP95 = Math.ceil(this.requisicoes * 0.95);
    let acumulado = 0;
    let p95 = 0;
    for (let indice = 0; indice < this.distribuicao.length; indice += 1) {
      acumulado += this.distribuicao[indice] ?? 0;
      if (acumulado >= alvoP95 && alvoP95 > 0) {
        p95 = LIMITES_DURACAO_MS[indice] ?? 5_001;
        break;
      }
    }
    return {
      duracaoMediaMs:
        this.requisicoes === 0
          ? 0
          : Number((this.somaDuracaoMs / this.requisicoes).toFixed(3)),
      duracaoP95AproximadaMs: p95,
      falhas: this.falhas,
      requisicoes: this.requisicoes,
    };
  }
}

export const registroMetricasOperacionais = new RegistroMetricasOperacionais();
