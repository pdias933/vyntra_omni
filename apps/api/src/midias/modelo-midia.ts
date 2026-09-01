export type CategoriaMidia = 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'PDF';

export interface MidiaValidada {
  readonly categoria: CategoriaMidia;
  readonly conteudoHash: string;
  readonly mimeDetectado: string;
  readonly tamanhoBytes: number;
}

export interface ReferenciaArmazenamentoPrivado {
  readonly bucketPrivado: string;
  readonly chaveObjeto: string;
}

export interface MidiaMensagemPersistida
  extends MidiaValidada,
    ReferenciaArmazenamentoPrivado {
  readonly armazenadaEm: Date;
  readonly mensagemId: string;
  readonly mimeDeclarado: string;
}
