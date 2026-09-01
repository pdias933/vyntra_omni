import type { AvisoMobileRecebido } from './modelo-aviso-mobile';

export interface SincronizadorAoReceberAviso {
  sincronizar(): Promise<void>;
}

export interface NavegadorAposSincronizacao {
  abrirAtendimento(atendimentoId: string): Promise<void>;
  abrirConversa(conversaId: string): Promise<void>;
}

export class CoordenadorAvisosMobile {
  private sincronizacaoEmCurso: Promise<void> | undefined;

  public constructor(
    private readonly sincronizador: SincronizadorAoReceberAviso,
    private readonly navegador: NavegadorAposSincronizacao,
  ) {}

  public receber(_aviso: AvisoMobileRecebido): void {
    void this.sincronizarUmaVez().catch(() => undefined);
  }

  public async abrir(aviso: AvisoMobileRecebido): Promise<void> {
    await this.sincronizarUmaVez();
    if (aviso.conversaId !== undefined) {
      await this.navegador.abrirConversa(aviso.conversaId);
      return;
    }
    if (aviso.atendimentoId !== undefined) {
      await this.navegador.abrirAtendimento(aviso.atendimentoId);
    }
  }

  private sincronizarUmaVez(): Promise<void> {
    this.sincronizacaoEmCurso ??= this.sincronizador
      .sincronizar()
      .finally(() => {
        this.sincronizacaoEmCurso = undefined;
      });
    return this.sincronizacaoEmCurso;
  }
}
