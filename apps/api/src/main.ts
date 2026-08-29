import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { ModuloAplicacao } from './modulo-aplicacao.js';

async function iniciarAplicacao(): Promise<void> {
  const aplicacao = await NestFactory.create(ModuloAplicacao);

  await aplicacao.listen(3000, '127.0.0.1');
}

await iniciarAplicacao();
