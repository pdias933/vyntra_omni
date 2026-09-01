import { readFile } from 'node:fs/promises';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import type { ReferenciaArmazenamentoPrivado } from './modelo-midia.js';
import type { PortaArmazenamentoPrivado } from './porta-armazenamento-privado.js';

const CHAVE_OBJETO = /^midias\/[0-9a-f]{2}\/[0-9a-f-]{36}$/u;

@Injectable()
export class AdaptadorArmazenamentoS3 implements PortaArmazenamentoPrivado {
  private cliente?: S3Client;
  private bucket?: string;

  public async guardar(chaveObjeto: string, conteudo: Uint8Array, mime: string): Promise<ReferenciaArmazenamentoPrivado> {
    this.validarChave(chaveObjeto);
    const { bucket, cliente } = await this.configurar();
    await cliente.send(new PutObjectCommand({
      Body: conteudo,
      Bucket: bucket,
      ContentLength: conteudo.byteLength,
      ContentType: mime,
      Key: chaveObjeto,
    }));
    return { bucketPrivado: bucket, chaveObjeto };
  }

  public async obter(chaveObjeto: string): Promise<Uint8Array> {
    this.validarChave(chaveObjeto);
    const { bucket, cliente } = await this.configurar();
    const resposta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: chaveObjeto }));
    if (resposta.Body === undefined) throw new Error('OBJETO_STORAGE_AUSENTE');
    return resposta.Body.transformToByteArray();
  }

  private async configurar(): Promise<{ readonly bucket: string; readonly cliente: S3Client }> {
    if (this.cliente !== undefined && this.bucket !== undefined) return { bucket: this.bucket, cliente: this.cliente };
    const endpoint = process.env.STORAGE_ENDPOINT?.trim();
    const bucket = process.env.STORAGE_BUCKET?.trim();
    const regiao = process.env.STORAGE_REGION?.trim();
    const acesso = await this.lerSegredo(process.env.STORAGE_CHAVE_ACESSO_FILE);
    const segredo = await this.lerSegredo(process.env.STORAGE_CHAVE_SECRETA_FILE);
    if (!endpoint || !bucket || !regiao || acesso === undefined || segredo === undefined) throw new Error('CONFIGURACAO_STORAGE_AUSENTE');
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new Error('CONFIGURACAO_STORAGE_INVALIDA');
    this.bucket = bucket;
    this.cliente = new S3Client({
      credentials: { accessKeyId: acesso, secretAccessKey: segredo },
      endpoint: url.origin,
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
      region: regiao,
    });
    return { bucket, cliente: this.cliente };
  }

  private async lerSegredo(caminho?: string): Promise<string | undefined> {
    if (caminho === undefined) return undefined;
    const valor = (await readFile(caminho, 'utf8')).trim();
    return valor.length === 0 ? undefined : valor;
  }

  private validarChave(chave: string): void {
    if (!CHAVE_OBJETO.test(chave)) throw new Error('CHAVE_STORAGE_INVALIDA');
  }
}
