import { File as ArquivoSistema } from 'expo-file-system';

const LIMITES_POR_MIME = new Map<string, number>([
  ['image/jpeg', 8 * 1024 * 1024],
  ['image/png', 8 * 1024 * 1024],
  ['image/webp', 8 * 1024 * 1024],
  ['audio/mpeg', 16 * 1024 * 1024],
  ['audio/ogg', 16 * 1024 * 1024],
  ['video/mp4', 32 * 1024 * 1024],
  ['application/pdf', 20 * 1024 * 1024],
]);

export type CategoriaMidiaMobile = 'AUDIO' | 'IMAGEM' | 'PDF' | 'VIDEO';

export interface MidiaSelecionadaMobile {
  readonly categoria: CategoriaMidiaMobile;
  readonly mime: string;
  readonly nome: string;
  readonly tamanhoBytes: number;
  readonly uri: string;
}

export class ErroSelecaoMidiaMobile extends Error {
  public constructor(public readonly codigo: 'ARQUIVO_INACESSIVEL' | 'FORMATO_NAO_PERMITIDO' | 'TAMANHO_EXCEDIDO') {
    super(codigo);
    this.name = 'ErroSelecaoMidiaMobile';
  }
}

function categoria(mime: string): CategoriaMidiaMobile {
  if (mime.startsWith('image/')) return 'IMAGEM';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'video/mp4') return 'VIDEO';
  return 'PDF';
}

function validar(arquivo: ArquivoSistema): MidiaSelecionadaMobile {
  const mime = arquivo.type.trim().toLowerCase();
  const limite = LIMITES_POR_MIME.get(mime);
  if (
    limite === undefined ||
    arquivo.name.trim().length < 1 ||
    arquivo.name.length > 180 ||
    /[\\/]/u.test(arquivo.name) ||
    arquivo.name.includes('\u0000')
  ) {
    throw new ErroSelecaoMidiaMobile('FORMATO_NAO_PERMITIDO');
  }
  if (!arquivo.exists || !Number.isSafeInteger(arquivo.size) || arquivo.size < 8) {
    throw new ErroSelecaoMidiaMobile('ARQUIVO_INACESSIVEL');
  }
  if (arquivo.size > limite) {
    throw new ErroSelecaoMidiaMobile('TAMANHO_EXCEDIDO');
  }
  return {
    categoria: categoria(mime),
    mime,
    nome: arquivo.name,
    tamanhoBytes: arquivo.size,
    uri: arquivo.uri,
  };
}

export class AdaptadorSelecaoMidiaNativa {
  public async selecionar(): Promise<MidiaSelecionadaMobile | undefined> {
    const resultado = await ArquivoSistema.pickFileAsync({
      mimeTypes: [...LIMITES_POR_MIME.keys()],
      multipleFiles: false,
    });
    if (resultado.canceled) return undefined;
    return validar(resultado.result);
  }

  public async materializar(
    selecao: MidiaSelecionadaMobile,
  ): Promise<globalThis.File> {
    const arquivoAtual = new ArquivoSistema(selecao.uri);
    const atual = validar(arquivoAtual);
    if (
      atual.mime !== selecao.mime ||
      atual.nome !== selecao.nome ||
      atual.tamanhoBytes !== selecao.tamanhoBytes
    ) {
      throw new ErroSelecaoMidiaMobile('ARQUIVO_INACESSIVEL');
    }
    const resposta = await fetch(selecao.uri);
    const conteudo = await resposta.blob();
    if (conteudo.size !== selecao.tamanhoBytes) {
      throw new ErroSelecaoMidiaMobile('ARQUIVO_INACESSIVEL');
    }
    return new globalThis.File([conteudo], selecao.nome, {
      type: selecao.mime,
    });
  }
}
