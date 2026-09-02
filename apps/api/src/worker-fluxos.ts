import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { ModuloWorkerFluxos } from './execucoes-fluxo/modulo-worker-fluxos.js';
import { ProcessoRecuperacaoExecucoesFluxo } from './execucoes-fluxo/processo-recuperacao-execucoes-fluxo.js';

const aplicacao = await NestFactory.createApplicationContext(
  ModuloWorkerFluxos,
  { abortOnError: true },
);
const processo = aplicacao.get(ProcessoRecuperacaoExecucoesFluxo);
const encerrar = (): void => {
  processo.solicitarDrenagem();
};
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);

try {
  await processo.executar();
} finally {
  await aplicacao.close();
}
