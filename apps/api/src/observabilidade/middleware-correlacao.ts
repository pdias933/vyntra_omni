import { randomUUID } from 'node:crypto';

import { contextoCorrelacao } from './contexto-correlacao.js';
import type { RegistradorTecnico } from './logger-estruturado.js';

interface RequisicaoHttpMinima {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly method?: string;
}

interface RespostaHttpMinima {
  readonly statusCode: number;
  once(evento: 'finish', callback: () => void): void;
  setHeader(nome: string, valor: string): void;
}

type ProximoMiddleware = () => void;

const UUID_SEGURO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function obterCorrelacaoRecebida(
  cabecalho: string | readonly string[] | undefined,
): string | undefined {
  const valor = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  return typeof valor === 'string' && UUID_SEGURO.test(valor)
    ? valor.toLowerCase()
    : undefined;
}

export function criarMiddlewareCorrelacao(
  logger: RegistradorTecnico,
): (
  requisicao: RequisicaoHttpMinima,
  resposta: RespostaHttpMinima,
  proximo: ProximoMiddleware,
) => void {
  return (requisicao, resposta, proximo): void => {
    const correlacaoId =
      obterCorrelacaoRecebida(requisicao.headers['x-correlation-id']) ??
      randomUUID();
    const inicio = process.hrtime.bigint();

    contextoCorrelacao.executar(correlacaoId, () => {
      resposta.setHeader('x-correlation-id', correlacaoId);
      resposta.once('finish', () => {
        const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;
        logger.registrar('info', 'REQUISICAO_HTTP_CONCLUIDA', {
          duracao_ms: Number(duracaoMs.toFixed(3)),
          metodo_http: requisicao.method ?? 'DESCONHECIDO',
          modulo: 'HTTP',
          status_http: resposta.statusCode,
        });
      });
      proximo();
    });
  };
}
