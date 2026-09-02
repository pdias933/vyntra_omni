import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ValidacaoMfaPreparada } from './modelo-mfa.js';
import { REPOSITORIO_MFA, type RepositorioMfa } from './repositorio-mfa.js';
import { ServicoProtecaoMfa } from './servico-protecao-mfa.js';

const PASSO_TOTP_SEGUNDOS = 30;
const DIGITOS_TOTP = 6;
const CODIGO_TOTP = /^\d{6}$/u;

function decodificarBase32(valor: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let acumulador = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const caractere of valor) {
    const indice = alfabeto.indexOf(caractere);
    if (indice < 0) throw new Error('SEGREDO_TOTP_INVALIDO');
    acumulador = (acumulador << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulador >>> bits) & 0xff);
      acumulador &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

export function calcularCodigoTotp(segredo: string, contador: bigint): string {
  if (contador < 0n) throw new Error('CONTADOR_TOTP_INVALIDO');
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(contador);
  const resumo = createHmac('sha1', decodificarBase32(segredo))
    .update(mensagem)
    .digest();
  const deslocamento = resumo[resumo.length - 1]! & 0x0f;
  const numero = (resumo.readUInt32BE(deslocamento) & 0x7fffffff) % 10 ** DIGITOS_TOTP;
  return numero.toString().padStart(DIGITOS_TOTP, '0');
}

@Injectable()
export class ServicoMfa {
  public constructor(
    @Inject(REPOSITORIO_MFA)
    private readonly repositorio: RepositorioMfa,
    @Inject(ServicoProtecaoMfa)
    private readonly protecao: ServicoProtecaoMfa,
  ) {}

  public async prepararValidacao(
    usuarioId: string,
    codigo: string,
    agora: Date,
  ): Promise<ValidacaoMfaPreparada | undefined> {
    const fator = await this.repositorio.obterFator(usuarioId);
    if (fator?.estado !== 'ATIVO') return undefined;

    if (CODIGO_TOTP.test(codigo)) {
      const segredo = await this.protecao.revelarSegredoTotp(
        fator.segredoProtegido,
      );
      const contadorAtual = BigInt(
        Math.floor(agora.getTime() / 1_000 / PASSO_TOTP_SEGUNDOS),
      );
      for (const deslocamento of [-1n, 0n, 1n]) {
        const contador = contadorAtual + deslocamento;
        if (contador < 0n || contador <= (fator.ultimoContadorUsado ?? -1n)) {
          continue;
        }
        const esperado = calcularCodigoTotp(segredo, contador);
        if (
          timingSafeEqual(Buffer.from(codigo, 'utf8'), Buffer.from(esperado, 'utf8'))
        ) {
          return { contador, tipo: 'TOTP' };
        }
      }
      return undefined;
    }

    let codigoHash: string;
    try {
      codigoHash = await this.protecao.calcularHashCodigoRecuperacao(codigo);
    } catch {
      return undefined;
    }
    const recebido = Buffer.from(codigoHash, 'hex');
    const encontrado = fator.codigosRecuperacaoAtivos.find((hash) =>
      timingSafeEqual(recebido, Buffer.from(hash, 'hex')),
    );
    return encontrado === undefined
      ? undefined
      : { codigoHash: encontrado, tipo: 'RECUPERACAO' };
  }

  public async consumirValidacao(
    usuarioId: string,
    validacao: ValidacaoMfaPreparada,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return validacao.tipo === 'TOTP'
      ? this.repositorio.consumirContadorTotp(
          usuarioId,
          validacao.contador,
          transacao,
        )
      : this.repositorio.consumirCodigoRecuperacao(
          usuarioId,
          validacao.codigoHash,
          agora,
          transacao,
        );
  }
}
