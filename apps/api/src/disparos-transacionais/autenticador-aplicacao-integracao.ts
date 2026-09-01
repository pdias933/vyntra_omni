import { createHash, timingSafeEqual } from 'node:crypto';

import type { AplicacaoIntegracao } from './modelo-disparo-transacional.js';

export class ErroAutenticacaoAplicacao extends Error {
  public constructor() {
    super('APLICACAO_NAO_AUTENTICADA');
  }
}

export function calcularHashSegredoAplicacao(segredo: string): string {
  if (segredo.length < 32 || segredo.length > 512 || segredo.includes('\u0000')) {
    throw new ErroAutenticacaoAplicacao();
  }
  return createHash('sha256').update(segredo, 'utf8').digest('hex');
}

export class AutenticadorAplicacaoIntegracao {
  public autenticar(
    aplicacao: AplicacaoIntegracao,
    segredoApresentado: string,
  ): { readonly aplicacaoId: string } {
    if (aplicacao.estado !== 'ATIVA') throw new ErroAutenticacaoAplicacao();
    const esperado = Buffer.from(aplicacao.segredoHash, 'hex');
    const recebido = Buffer.from(
      calcularHashSegredoAplicacao(segredoApresentado),
      'hex',
    );
    if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
      throw new ErroAutenticacaoAplicacao();
    }
    return { aplicacaoId: aplicacao.id };
  }
}
