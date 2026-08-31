import type { LoggerService, LogLevel } from '@nestjs/common';
import pino, { type DestinationStream, type Logger } from 'pino';

import { contextoCorrelacao } from './contexto-correlacao.js';
import { SanitizadorLogs } from './sanitizador-logs.js';

export type NivelLogTecnico = 'debug' | 'error' | 'info' | 'warn';

export interface RegistradorTecnico {
  registrar(
    nivel: NivelLogTecnico,
    evento: string,
    campos?: Readonly<Record<string, unknown>>,
  ): void;
}

const sanitizador = new SanitizadorLogs();

export class LoggerEstruturado implements LoggerService, RegistradorTecnico {
  private readonly logger: Logger;

  public constructor(destino?: DestinationStream) {
    const opcoes = {
      base: { aplicacao: 'vyntra-api' },
      level: process.env.NIVEL_LOG ?? 'info',
      redact: {
        censor: '[REMOVIDO]',
        paths: [
          'authorization',
          'cnpj',
          'cookie',
          'cpf',
          'payload',
          'pix',
          'senha',
          'segredo',
          'token',
        ],
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };
    this.logger = destino === undefined ? pino(opcoes) : pino(opcoes, destino);
  }

  public registrar(
    nivel: NivelLogTecnico,
    evento: string,
    campos: Readonly<Record<string, unknown>> = {},
  ): void {
    const registro = sanitizador.sanitizarRegistro({
      ...campos,
      correlacao_id: contextoCorrelacao.obter(),
      evento,
    });

    this.escrever(nivel, registro);
  }

  public log(mensagem: unknown, ...parametros: unknown[]): void {
    this.registrar('info', 'LOG_APLICACAO', {
      contexto: this.obterContexto(parametros),
      mensagem,
    });
  }

  public error(mensagem: unknown, ...parametros: unknown[]): void {
    this.registrar('error', 'ERRO_APLICACAO', {
      contexto: this.obterContexto(parametros),
      mensagem,
    });
  }

  public warn(mensagem: unknown, ...parametros: unknown[]): void {
    this.registrar('warn', 'ALERTA_APLICACAO', {
      contexto: this.obterContexto(parametros),
      mensagem,
    });
  }

  public debug(mensagem: unknown, ...parametros: unknown[]): void {
    this.registrar('debug', 'DEBUG_APLICACAO', {
      contexto: this.obterContexto(parametros),
      mensagem,
    });
  }

  public verbose(mensagem: unknown, ...parametros: unknown[]): void {
    this.debug(mensagem, ...parametros);
  }

  public fatal(mensagem: unknown, ...parametros: unknown[]): void {
    this.error(mensagem, ...parametros);
  }

  public setLogLevels(_niveis: LogLevel[]): void {}

  private escrever(
    nivel: NivelLogTecnico,
    registro: Readonly<Record<string, unknown>>,
  ): void {
    switch (nivel) {
      case 'debug':
        this.logger.debug(registro);
        break;
      case 'error':
        this.logger.error(registro);
        break;
      case 'warn':
        this.logger.warn(registro);
        break;
      case 'info':
        this.logger.info(registro);
        break;
    }
  }

  private obterContexto(parametros: readonly unknown[]): string | undefined {
    const ultimo = parametros.at(-1);
    return typeof ultimo === 'string' ? ultimo : undefined;
  }
}

export const loggerEstruturado = new LoggerEstruturado();

export const loggerSilencioso: RegistradorTecnico = {
  registrar: () => undefined,
};
