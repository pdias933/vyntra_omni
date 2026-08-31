import 'reflect-metadata';

import { criarAplicacao } from './configurar-aplicacao.js';

async function iniciarAplicacao(): Promise<void> {
  const aplicacao = await criarAplicacao();
  const enderecoHttp = process.env.ENDERECO_HTTP ?? '127.0.0.1';
  const portaHttp = Number(process.env.PORTA_HTTP ?? '3000');

  if (!Number.isInteger(portaHttp) || portaHttp < 1 || portaHttp > 65_535) {
    throw new Error('PORTA_HTTP_INVALIDA');
  }

  await aplicacao.listen(portaHttp, enderecoHttp);
}

await iniciarAplicacao();
