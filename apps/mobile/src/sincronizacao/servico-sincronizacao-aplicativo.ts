import type { ServicoAutenticacaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import {
  MotorSincronizacaoMobile,
  type EstadoSincronizacaoMobile,
  type GanchosSegurancaSincronizacaoMobile,
} from './motor-sincronizacao-mobile';

export class ServicoSincronizacaoAplicativo {
  private readonly motor: MotorSincronizacaoMobile;

  public constructor(autenticacao: ServicoAutenticacaoAplicativo) {
    this.motor = new MotorSincronizacaoMobile(
      autenticacao.replica,
      autenticacao.autorizacaoOffline,
      (forcarRenovacao) =>
        autenticacao.obterCredenciaisSincronizacao(forcarRenovacao),
      undefined,
      undefined,
      () => autenticacao.invalidarSessaoLocal(),
    );
  }

  public configurarSeguranca(
    ganchos: Pick<
      GanchosSegurancaSincronizacaoMobile,
      'aoEscopoSubstituido' | 'reconciliarPendencias'
    >,
  ): void {
    this.motor.configurarGanchosSeguranca(ganchos);
  }

  public iniciar(): void {
    this.motor.iniciar();
  }

  public pausar(): void {
    this.motor.pausar();
  }

  public observar(
    observador: (estado: EstadoSincronizacaoMobile) => void,
  ): () => void {
    return this.motor.observar(observador);
  }

  public sincronizarAgora(): void {
    this.motor.sincronizarAgora();
  }

  public async sincronizarAte(sequenciaObservada: string): Promise<void> {
    this.motor.iniciar();
    const convergencia = this.motor.aguardarSequencia(sequenciaObservada);
    this.motor.sincronizarAgora();
    await convergencia;
  }
}
