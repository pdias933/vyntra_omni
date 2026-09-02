import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

const SEGREDO_TOTP = /^[A-Z2-7]{32}$/u;
const CHAVE_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;
const FORMATO_PROTEGIDO = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/u;
const CODIGO_RECUPERACAO = /^[A-Z2-9]{20}$/u;

@Injectable()
export class ServicoProtecaoMfa {
  private chaveCarregada: Promise<Buffer> | undefined;

  public async protegerSegredoTotp(segredo: string): Promise<string> {
    this.validarSegredoTotp(segredo);
    const chave = await this.obterChave();
    const nonce = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', chave, nonce);
    cifrador.setAAD(Buffer.from('VYNTRA_MFA_TOTP_V1', 'utf8'));
    const cifrado = Buffer.concat([
      cifrador.update(segredo, 'utf8'),
      cifrador.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64url'),
      cifrado.toString('base64url'),
      cifrador.getAuthTag().toString('base64url'),
    ].join('.');
  }

  public async revelarSegredoTotp(protegido: string): Promise<string> {
    const partes = FORMATO_PROTEGIDO.exec(protegido);
    if (partes?.[1] === undefined || partes[2] === undefined || partes[3] === undefined) {
      throw new Error('SEGREDO_MFA_PROTEGIDO_INVALIDO');
    }
    const decifrador = createDecipheriv(
      'aes-256-gcm',
      await this.obterChave(),
      Buffer.from(partes[1], 'base64url'),
    );
    decifrador.setAAD(Buffer.from('VYNTRA_MFA_TOTP_V1', 'utf8'));
    decifrador.setAuthTag(Buffer.from(partes[3], 'base64url'));
    const segredo = Buffer.concat([
      decifrador.update(Buffer.from(partes[2], 'base64url')),
      decifrador.final(),
    ]).toString('utf8');
    this.validarSegredoTotp(segredo);
    return segredo;
  }

  public async calcularHashCodigoRecuperacao(codigo: string): Promise<string> {
    const normalizado = this.normalizarCodigoRecuperacao(codigo);
    return createHmac('sha256', await this.obterChave())
      .update('VYNTRA_RECUPERACAO_MFA_V1\0', 'utf8')
      .update(normalizado, 'utf8')
      .digest('hex');
  }

  public normalizarCodigoRecuperacao(codigo: string): string {
    const normalizado = codigo
      .normalize('NFKC')
      .toLocaleUpperCase('pt-BR')
      .replaceAll('-', '')
      .replaceAll(' ', '');
    if (!CODIGO_RECUPERACAO.test(normalizado)) {
      throw new Error('CODIGO_RECUPERACAO_MFA_INVALIDO');
    }
    return normalizado;
  }

  private validarSegredoTotp(segredo: string): void {
    if (!SEGREDO_TOTP.test(segredo)) {
      throw new Error('SEGREDO_TOTP_INVALIDO');
    }
  }

  private obterChave(): Promise<Buffer> {
    this.chaveCarregada ??= this.carregarChave();
    return this.chaveCarregada;
  }

  private async carregarChave(): Promise<Buffer> {
    const caminho = process.env.MFA_CHAVE_PROTECAO_FILE;
    if (caminho === undefined || caminho.trim().length === 0) {
      throw new Error('CHAVE_PROTECAO_MFA_AUSENTE');
    }
    const valor = (await readFile(caminho, 'utf8')).trim();
    if (!CHAVE_BASE64URL.test(valor)) {
      throw new Error('CHAVE_PROTECAO_MFA_INVALIDA');
    }
    const chave = Buffer.from(valor, 'base64url');
    if (chave.length !== 32) throw new Error('CHAVE_PROTECAO_MFA_INVALIDA');
    return chave;
  }
}
