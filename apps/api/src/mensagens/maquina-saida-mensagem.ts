import {
  ErroMensagemInvalida,
  ErroTransicaoMensagemInvalida,
} from './erros-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';

const CODIGO_FALHA = /^[A-Z][A-Z0-9_]{2,99}$/u;

export class MaquinaSaidaMensagem {
  public iniciarEnvio(
    mensagem: MensagemSaidaPersistida,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'NA_FILA');
    return {
      ...mensagem,
      codigoFalha: undefined,
      estadoSaida: 'ENVIANDO',
      proximaTentativaEm: undefined,
      tentativasEnvio: mensagem.tentativasEnvio + 1,
      versao: mensagem.versao + 1,
    };
  }

  public aceitarEnvio(
    mensagem: MensagemSaidaPersistida,
    identificadorExternoMensagem: string,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'ENVIANDO');
    this.validarInstante(ocorridaEm, mensagem.recebidaServidorEm);
    const identificador = identificadorExternoMensagem.trim();
    if (identificador.length < 1 || identificador.length > 256) {
      throw new ErroMensagemInvalida();
    }
    return {
      ...mensagem,
      enviadaEm: ocorridaEm,
      estadoSaida: 'ENVIADA',
      identificadorExternoMensagem: identificador,
      versao: mensagem.versao + 1,
    };
  }

  public registrarFalhaTemporaria(
    mensagem: MensagemSaidaPersistida,
    codigoFalha: string,
    proximaTentativaEm: Date,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'ENVIANDO');
    this.validarCodigoFalha(codigoFalha);
    this.validarInstante(ocorridaEm, mensagem.recebidaServidorEm);
    this.validarInstante(proximaTentativaEm, ocorridaEm);
    if (proximaTentativaEm <= ocorridaEm) throw new ErroMensagemInvalida();
    return {
      ...mensagem,
      codigoFalha,
      estadoSaida: 'NA_FILA',
      proximaTentativaEm,
      versao: mensagem.versao + 1,
    };
  }

  public registrarFalhaDefinitiva(
    mensagem: MensagemSaidaPersistida,
    codigoFalha: string,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'ENVIANDO');
    this.validarCodigoFalha(codigoFalha);
    this.validarInstante(ocorridaEm, mensagem.recebidaServidorEm);
    return {
      ...mensagem,
      codigoFalha,
      estadoSaida: 'FALHOU',
      falhouEm: ocorridaEm,
      proximaTentativaEm: undefined,
      versao: mensagem.versao + 1,
    };
  }

  public cancelar(
    mensagem: MensagemSaidaPersistida,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'NA_FILA');
    this.validarInstante(ocorridaEm, mensagem.recebidaServidorEm);
    return {
      ...mensagem,
      canceladaEm: ocorridaEm,
      estadoSaida: 'CANCELADA',
      proximaTentativaEm: undefined,
      versao: mensagem.versao + 1,
    };
  }

  public registrarEntrega(
    mensagem: MensagemSaidaPersistida,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'ENVIADA');
    this.validarInstante(ocorridaEm, mensagem.enviadaEm);
    return {
      ...mensagem,
      entregueEm: ocorridaEm,
      estadoSaida: 'ENTREGUE',
      versao: mensagem.versao + 1,
    };
  }

  public registrarLeitura(
    mensagem: MensagemSaidaPersistida,
    ocorridaEm: Date,
  ): MensagemSaidaPersistida {
    this.exigirEstado(mensagem, 'ENTREGUE');
    this.validarInstante(ocorridaEm, mensagem.entregueEm);
    return {
      ...mensagem,
      estadoSaida: 'LIDA',
      lidaEm: ocorridaEm,
      versao: mensagem.versao + 1,
    };
  }

  private exigirEstado(
    mensagem: MensagemSaidaPersistida,
    esperado: MensagemSaidaPersistida['estadoSaida'],
  ): void {
    if (mensagem.estadoSaida !== esperado) {
      throw new ErroTransicaoMensagemInvalida();
    }
  }

  private validarCodigoFalha(codigo: string): void {
    if (!CODIGO_FALHA.test(codigo)) throw new ErroMensagemInvalida();
  }

  private validarInstante(instante: Date, minimo: Date | undefined): void {
    if (
      !(instante instanceof Date) ||
      !Number.isFinite(instante.getTime()) ||
      minimo === undefined ||
      instante < minimo
    ) {
      throw new ErroMensagemInvalida();
    }
  }
}
