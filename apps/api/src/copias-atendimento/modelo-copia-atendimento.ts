export interface CopiaAtendimentoEmitida {
  readonly token: string;
  readonly expiraEm: Date;
  readonly nomeArquivo: string;
}

export interface ArquivoCopiaAtendimento {
  readonly conteudo: string;
  readonly nomeArquivo: string;
}
