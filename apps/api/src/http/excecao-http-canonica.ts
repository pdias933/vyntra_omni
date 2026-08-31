import { HttpException } from '@nestjs/common';

export interface CorpoErroCanonico {
  readonly codigo: string;
  readonly mensagem: string;
}

export class ExcecaoHttpCanonica extends HttpException {
  public constructor(
    status: number,
    codigo: string,
    mensagem: string,
  ) {
    super({ codigo, mensagem } satisfies CorpoErroCanonico, status);
  }
}
