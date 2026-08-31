import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import type { CorpoErroCanonico } from './excecao-http-canonica.js';

const ERROS_POR_STATUS: Readonly<Record<number, CorpoErroCanonico>> = {
  [HttpStatus.BAD_REQUEST]: {
    codigo: 'REQUISICAO_INVALIDA',
    mensagem: 'A requisição possui dados inválidos.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    codigo: 'NAO_AUTENTICADO',
    mensagem: 'É necessário autenticar-se para continuar.',
  },
  [HttpStatus.FORBIDDEN]: {
    codigo: 'PERMISSAO_NEGADA',
    mensagem: 'Você não tem permissão para realizar esta ação.',
  },
  [HttpStatus.NOT_FOUND]: {
    codigo: 'RECURSO_NAO_ENCONTRADO',
    mensagem: 'O recurso solicitado não foi encontrado.',
  },
  [HttpStatus.CONFLICT]: {
    codigo: 'CONFLITO_DE_ESTADO',
    mensagem: 'O recurso foi alterado e a operação não pôde ser concluída.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    codigo: 'CONTEUDO_EXCEDE_LIMITE',
    mensagem: 'O conteúdo enviado excede o limite permitido.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    codigo: 'LIMITE_DE_REQUISICOES',
    mensagem: 'Muitas solicitações foram feitas. Tente novamente em instantes.',
  },
};

const ERRO_INTERNO: CorpoErroCanonico = {
  codigo: 'ERRO_INTERNO',
  mensagem: 'Não foi possível concluir a solicitação.',
};

function possuiCorpoCanonico(valor: unknown): valor is CorpoErroCanonico {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'codigo' in valor &&
    typeof valor.codigo === 'string' &&
    'mensagem' in valor &&
    typeof valor.mensagem === 'string'
  );
}

@Catch()
export class FiltroExcecaoHttp implements ExceptionFilter {
  public constructor(private readonly adaptadorHttp: HttpAdapterHost) {}

  public catch(excecao: unknown, contexto: ArgumentsHost): void {
    const http = this.adaptadorHttp.httpAdapter;
    const resposta = contexto.switchToHttp().getResponse();
    const status =
      excecao instanceof HttpException
        ? excecao.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const respostaExcecao =
      excecao instanceof HttpException ? excecao.getResponse() : undefined;
    const corpo = possuiCorpoCanonico(respostaExcecao)
      ? respostaExcecao
      : (ERROS_POR_STATUS[status] ?? ERRO_INTERNO);

    http.reply(resposta, corpo, status);
  }
}
