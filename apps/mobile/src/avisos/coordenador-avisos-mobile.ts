import type { CaixaAvisosMobile } from './caixa-avisos-mobile';
import type { AvisoMobileRecebido } from './modelo-aviso-mobile';

export interface SincronizadorAoReceberAviso {
  sincronizarAte(sequenciaObservada: string): Promise<void>;
}

export interface NavegadorAposSincronizacao {
  abrirAtendimento(atendimentoId: string): Promise<void>;
  abrirConversa(conversaId: string): Promise<void>;
}

export class CoordenadorAvisosMobile {
  private sincronizacaoEmCurso: Promise<void> | undefined;
  private sequenciaSolicitada = 0n;

  public constructor(
    private readonly sincronizador: SincronizadorAoReceberAviso,
    private readonly navegador: NavegadorAposSincronizacao,
    private readonly caixa: CaixaAvisosMobile,
  ) {}

  public receber(aviso: AvisoMobileRecebido): void {
    this.caixa.registrar(aviso);
    void this.sincronizarAte(aviso.sequenciaObservada).catch(() => undefined);
  }

  public async abrir(aviso: AvisoMobileRecebido): Promise<void> {
    this.caixa.registrar(aviso);
    await this.sincronizarAte(aviso.sequenciaObservada);
    if (aviso.conversaId !== undefined) {
      await this.navegador.abrirConversa(aviso.conversaId);
    } else if (aviso.atendimentoId !== undefined) {
      await this.navegador.abrirAtendimento(aviso.atendimentoId);
    }
    this.caixa.remover(
      aviso.chaveAgrupamento,
      aviso.sequenciaObservada,
    );
  }

  public limpar(): void {
    this.caixa.limpar();
    this.sequenciaSolicitada = 0n;
  }

  private sincronizarAte(sequenciaObservada: string): Promise<void> {
    const solicitada = BigInt(sequenciaObservada);
    if (solicitada > this.sequenciaSolicitada) {
      this.sequenciaSolicitada = solicitada;
    }
    this.sincronizacaoEmCurso ??= this.convergir().finally(() => {
      this.sincronizacaoEmCurso = undefined;
    });
    return this.sincronizacaoEmCurso;
  }

  private async convergir(): Promise<void> {
    let atendida = 0n;
    while (atendida < this.sequenciaSolicitada) {
      const alvo = this.sequenciaSolicitada;
      await this.sincronizador.sincronizarAte(alvo.toString());
      atendida = alvo;
    }
  }
}
