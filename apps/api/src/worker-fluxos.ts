import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { ModuloWorkerFluxos } from './execucoes-fluxo/modulo-worker-fluxos.js';
import { ProcessoRecuperacaoExecucoesFluxo } from './execucoes-fluxo/processo-recuperacao-execucoes-fluxo.js';

const aplicacao = await NestFactory.createApplicationContext(
  ModuloWorkerFluxos,
  { abortOnError: true },
);
let continuar = true;
const encerrar = (): void => {
  continuar = false;
};
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);

try {
  await aplicacao
    .get(ProcessoRecuperacaoExecucoesFluxo)
    .executar(() => continuar);
} finally {
  await aplicacao.close();
}
