import type { INestApplication } from '@nestjs/common';

import type { ServicoProntidao } from './saude/servico-prontidao.js';

const LIMITE_DRENAGEM_MS = 15_000;

export async function encerrarAplicacaoGraciosamente(
  aplicacao: Pick<INestApplication, 'close'>,
  prontidao: Pick<ServicoProntidao, 'iniciarDrenagem'>,
  limiteMs = LIMITE_DRENAGEM_MS,
): Promise<void> {
  prontidao.iniciarDrenagem();
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      aplicacao.close(),
      new Promise<never>((_resolver, rejeitar) => {
        temporizador = setTimeout(
          () => rejeitar(new Error('TEMPO_DRENAGEM_EXCEDIDO')),
          limiteMs,
        );
        temporizador.unref();
      }),
    ]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}
