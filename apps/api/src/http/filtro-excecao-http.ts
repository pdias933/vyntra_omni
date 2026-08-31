import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import type { CorpoErroCanonico } from './excecao-http-canonica.js';
import {
  ErroNaoAutenticado,
  ErroPermissaoNegada,
} from '../autorizacao/erros-autorizacao.js';
import { contextoCorrelacao } from '../observabilidade/contexto-correlacao.js';
import type { RegistradorTecnico } from '../observabilidade/logger-estruturado.js';
import {
  ErroCredenciaisInvalidas,
  ErroLimiteLoginExcedido,
  ErroMfaNecessario,
  ErroRequisicaoWebNaoConfiavel,
} from '../autenticacao/erros-autenticacao.js';

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

const ERROS_AUTENTICACAO = {
  CREDENCIAIS_INVALIDAS: {
    codigo: 'CREDENCIAIS_INVALIDAS',
    mensagem: 'Não foi possível autenticar com as credenciais informadas.',
  },
  LIMITE_LOGIN_EXCEDIDO: {
    codigo: 'LIMITE_DE_REQUISICOES',
    mensagem: 'Muitas solicitações foram feitas. Tente novamente em instantes.',
  },
  MFA_NECESSARIO: {
    codigo: 'MFA_NECESSARIO',
    mensagem: 'É necessário concluir a autenticação multifator.',
  },
  REQUISICAO_WEB_NAO_CONFIAVEL: {
    codigo: 'REQUISICAO_NAO_CONFIAVEL',
    mensagem: 'A origem ou a proteção da requisição não pôde ser validada.',
  },
} satisfies Readonly<Record<string, CorpoErroCanonico>>;

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
  public constructor(
    private readonly adaptadorHttp: HttpAdapterHost,
    private readonly logger: RegistradorTecnico,
  ) {}

  public catch(excecao: unknown, contexto: ArgumentsHost): void {
    const http = this.adaptadorHttp.httpAdapter;
    const resposta = contexto.switchToHttp().getResponse();
    const status = this.obterStatus(excecao);
    const respostaExcecao =
      excecao instanceof HttpException ? excecao.getResponse() : undefined;
    const corpoAutenticacao = this.obterCorpoAutenticacao(excecao);
    const corpo =
      corpoAutenticacao ??
      (possuiCorpoCanonico(respostaExcecao)
        ? respostaExcecao
        : (ERROS_POR_STATUS[status] ?? ERRO_INTERNO));
    const correlacaoId = contextoCorrelacao.obter();

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.registrar('error', 'REQUISICAO_HTTP_FALHOU', {
        codigo_erro: corpo.codigo,
        modulo: 'HTTP',
        status_http: status,
      });
    }

    http.reply(
      resposta,
      {
        ...corpo,
        ...(correlacaoId === undefined
          ? {}
          : { correlacao_id: correlacaoId }),
      },
      status,
    );
  }

  private obterStatus(excecao: unknown): number {
    if (excecao instanceof ErroCredenciaisInvalidas) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (excecao instanceof ErroLimiteLoginExcedido) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (
      excecao instanceof ErroMfaNecessario ||
      excecao instanceof ErroRequisicaoWebNaoConfiavel
    ) {
      return HttpStatus.FORBIDDEN;
    }
    if (excecao instanceof ErroNaoAutenticado) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (excecao instanceof ErroPermissaoNegada) {
      return HttpStatus.FORBIDDEN;
    }

    return excecao instanceof HttpException
      ? excecao.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private obterCorpoAutenticacao(excecao: unknown): CorpoErroCanonico | undefined {
    if (excecao instanceof ErroCredenciaisInvalidas) {
      return ERROS_AUTENTICACAO.CREDENCIAIS_INVALIDAS;
    }
    if (excecao instanceof ErroLimiteLoginExcedido) {
      return ERROS_AUTENTICACAO.LIMITE_LOGIN_EXCEDIDO;
    }
    if (excecao instanceof ErroMfaNecessario) {
      return ERROS_AUTENTICACAO.MFA_NECESSARIO;
    }
    if (excecao instanceof ErroRequisicaoWebNaoConfiavel) {
      return ERROS_AUTENTICACAO.REQUISICAO_WEB_NAO_CONFIAVEL;
    }
    return undefined;
  }
}
