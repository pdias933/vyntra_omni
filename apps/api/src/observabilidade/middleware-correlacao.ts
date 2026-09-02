import { randomBytes, randomUUID } from 'node:crypto';

import { contextoCorrelacao } from './contexto-correlacao.js';
import { contextoRastreio } from './contexto-rastreio.js';
import type { RegistradorTecnico } from './logger-estruturado.js';
import {
  registroMetricasOperacionais,
  type RegistroMetricasOperacionais,
} from './registro-metricas.js';

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
const TRACEPARENT_SEGURO =
  /^00-([0-9a-f]{32})-([0-9a-f]{16})-(0[01])$/u;

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
  metricas: RegistroMetricasOperacionais = registroMetricasOperacionais,
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
    const traceparentRecebido = requisicao.headers.traceparent;
    const valorTraceparent = Array.isArray(traceparentRecebido)
      ? traceparentRecebido[0]
      : traceparentRecebido;
    const correspondencia =
      typeof valorTraceparent === 'string'
        ? TRACEPARENT_SEGURO.exec(valorTraceparent)
        : null;
    const traceId = correspondencia?.[1] ?? randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');

    contextoCorrelacao.executar(correlacaoId, () => {
      contextoRastreio.executar({ spanId, traceId }, () => {
        resposta.setHeader('x-correlation-id', correlacaoId);
        resposta.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
        resposta.once('finish', () => {
          const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;
          metricas.observarHttp(resposta.statusCode, duracaoMs);
          logger.registrar('info', 'REQUISICAO_HTTP_CONCLUIDA', {
            duracao_ms: Number(duracaoMs.toFixed(3)),
            metodo_http: requisicao.method ?? 'DESCONHECIDO',
            modulo: 'HTTP',
            status_http: resposta.statusCode,
          });
        });
        proximo();
      });
    });
  };
}
