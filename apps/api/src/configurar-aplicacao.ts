import { ValidationPipe } from '@nestjs/common';
import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';

import { ExcecaoHttpCanonica } from './http/excecao-http-canonica.js';
import { FiltroExcecaoHttp } from './http/filtro-excecao-http.js';
import { ModuloAplicacao } from './modulo-aplicacao.js';
import {
  loggerEstruturado,
  loggerSilencioso,
} from './observabilidade/logger-estruturado.js';
import { criarMiddlewareCorrelacao } from './observabilidade/middleware-correlacao.js';
import { configurarOpenApi } from './openapi/configurar-openapi.js';

export interface OpcoesAplicacao {
  readonly documentarOpenApi?: boolean;
  readonly logger?: NestApplicationOptions['logger'];
}

export async function criarAplicacao(
  opcoes: OpcoesAplicacao = {},
): Promise<INestApplication> {
  const registradorTecnico =
    opcoes.logger === false ? loggerSilencioso : loggerEstruturado;
  const opcoesNest: NestApplicationOptions =
    opcoes.logger === undefined
      ? {
          logger: loggerEstruturado,
          routeConflictPolicy: { duplicate: 'error', shadow: 'off' },
          routeResolutionStrategy: 'specificity',
        }
      : {
          logger: opcoes.logger,
          routeConflictPolicy: { duplicate: 'error', shadow: 'off' },
          routeResolutionStrategy: 'specificity',
        };
  const aplicacao = await NestFactory.create(ModuloAplicacao, opcoesNest);

  aplicacao.setGlobalPrefix('api/v1');
  aplicacao.use(criarMiddlewareCorrelacao(registradorTecnico));
  aplicacao.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: () =>
        new ExcecaoHttpCanonica(
          400,
          'REQUISICAO_INVALIDA',
          'A requisição possui dados inválidos.',
        ),
      forbidNonWhitelisted: true,
      transform: false,
      whitelist: true,
    }),
  );

  const adaptadorHttp = aplicacao.get(HttpAdapterHost);
  aplicacao.useGlobalFilters(
    new FiltroExcecaoHttp(adaptadorHttp, registradorTecnico),
  );

  if (opcoes.documentarOpenApi !== false) {
    configurarOpenApi(aplicacao);
  }

  return aplicacao;
}
