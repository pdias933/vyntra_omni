import { createHash } from 'node:crypto';

import { ErroMidiaInvalida } from './erros-midia.js';
import type { CategoriaMidia, MidiaValidada } from './modelo-midia.js';

interface AssinaturaMidia {
  readonly categoria: CategoriaMidia;
  readonly limiteBytes: number;
  readonly mime: string;
  detectar(amostra: Uint8Array): boolean;
}

const iniciaCom = (amostra: Uint8Array, assinatura: readonly number[]): boolean =>
  assinatura.every((byte, indice) => amostra[indice] === byte);

const ASSINATURAS: readonly AssinaturaMidia[] = [
  { categoria: 'IMAGEM', limiteBytes: 16 * 1024 * 1024, mime: 'image/jpeg', detectar: (b) => iniciaCom(b, [0xff, 0xd8, 0xff]) },
  { categoria: 'IMAGEM', limiteBytes: 16 * 1024 * 1024, mime: 'image/png', detectar: (b) => iniciaCom(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { categoria: 'IMAGEM', limiteBytes: 16 * 1024 * 1024, mime: 'image/webp', detectar: (b) => iniciaCom(b, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' },
  { categoria: 'AUDIO', limiteBytes: 16 * 1024 * 1024, mime: 'audio/mpeg', detectar: (b) => iniciaCom(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] ?? 0) >= 0xe0) },
  { categoria: 'AUDIO', limiteBytes: 16 * 1024 * 1024, mime: 'audio/ogg', detectar: (b) => iniciaCom(b, [0x4f, 0x67, 0x67, 0x53]) },
  { categoria: 'VIDEO', limiteBytes: 64 * 1024 * 1024, mime: 'video/mp4', detectar: (b) => String.fromCharCode(...b.slice(4, 8)) === 'ftyp' },
  { categoria: 'PDF', limiteBytes: 32 * 1024 * 1024, mime: 'application/pdf', detectar: (b) => iniciaCom(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
];

export class ValidadorMidia {
  public validar(
    conteudo: Uint8Array,
    mimeDeclarado: string,
    tamanhoInformado: number = conteudo.byteLength,
  ): MidiaValidada {
    if (
      !(conteudo instanceof Uint8Array) ||
      conteudo.byteLength < 8 ||
      !Number.isSafeInteger(tamanhoInformado) ||
      tamanhoInformado !== conteudo.byteLength
    ) {
      throw new ErroMidiaInvalida();
    }
    const assinatura = ASSINATURAS.find(({ detectar }) => detectar(conteudo));
    if (assinatura === undefined) throw new ErroMidiaInvalida('ASSINATURA_MIDIA_NAO_PERMITIDA');
    const mime = mimeDeclarado.trim().toLowerCase();
    if (mime !== assinatura.mime) throw new ErroMidiaInvalida('MIME_MIDIA_DIVERGENTE');
    if (conteudo.byteLength > assinatura.limiteBytes) {
      throw new ErroMidiaInvalida('MIDIA_EXCEDE_LIMITE');
    }
    return {
      categoria: assinatura.categoria,
      conteudoHash: createHash('sha256').update(conteudo).digest('hex'),
      mimeDetectado: assinatura.mime,
      tamanhoBytes: conteudo.byteLength,
    };
  }
}
