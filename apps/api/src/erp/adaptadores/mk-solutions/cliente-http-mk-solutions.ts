import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import type { ConfiguracaoMkSolutions } from './configuracao-mk-solutions.js';

const MAXIMO_CABECALHO_BYTES = 16 * 1024;
const FALHAS_ATE_ABRIR_CIRCUITO = 3;
const PAUSA_CIRCUITO_MS = 30_000;
const CAMINHOS_SOMENTE_LEITURA = new Set([
  '/mk/WSAutenticacao.rule',
  '/mk/WSMKConexoesPorCliente.rule',
  '/mk/WSMKConsultaClientes.rule',
  '/mk/WSMKConsultaDoc.rule',
  '/mk/WSMKContratosPorCliente.rule',
  '/mk/WSMKFaturas.rule',
]);

export class ErroTransporteMkSolutions extends Error {
  public constructor(
    public readonly codigo:
      | 'CIRCUITO_ABERTO'
      | 'CORPO_EXCESSIVO'
      | 'DNS_NAO_CONFIAVEL'
      | 'HTTP_INESPERADO'
      | 'REDE_INDISPONIVEL'
      | 'RESPOSTA_INVALIDA'
      | 'TEMPO_ESGOTADO',
  ) {
    super('TRANSPORTE_MK_INDISPONIVEL');
    this.name = 'ErroTransporteMkSolutions';
  }
}

export interface TransporteMkSolutions {
  obterJson(
    caminho: string,
    parametros: Readonly<Record<string, string>>,
  ): Promise<unknown>;
}

export type ExecutorHttpMkSolutions = (
  caminho: string,
  parametros: Readonly<Record<string, string>>,
  sinal: AbortSignal,
) => Promise<unknown>;

export class ClienteHttpMkSolutions implements TransporteMkSolutions {
  private aguardando: Array<() => void> = [];
  private circuitoAbertoAte = 0;
  private emAndamento = 0;
  private falhasConsecutivas = 0;
  private readonly executor: ExecutorHttpMkSolutions;

  public constructor(
    private readonly configuracao: ConfiguracaoMkSolutions,
    executor?: ExecutorHttpMkSolutions,
  ) {
    this.executor =
      executor ??
      ((caminho, parametros, sinal) =>
        this.executar(caminho, parametros, sinal));
  }

  public async obterJson(
    caminho: string,
    parametros: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const prazoFinal = Date.now() + this.configuracao.tempoEsperaMs;
    if (!CAMINHOS_SOMENTE_LEITURA.has(caminho)) {
      throw new ErroTransporteMkSolutions('HTTP_INESPERADO');
    }
    if (Date.now() < this.circuitoAbertoAte) {
      throw new ErroTransporteMkSolutions('CIRCUITO_ABERTO');
    }
    await this.adquirirVaga();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      if (Date.now() < this.circuitoAbertoAte) {
        throw new ErroTransporteMkSolutions('CIRCUITO_ABERTO');
      }
      const tempoRestante = prazoFinal - Date.now();
      if (tempoRestante <= 0) {
        throw new ErroTransporteMkSolutions('TEMPO_ESGOTADO');
      }
      const controlador = new AbortController();
      const prazoEsgotado = new Promise<never>((_resolver, rejeitar) => {
        controlador.signal.addEventListener(
          'abort',
          () => rejeitar(new ErroTransporteMkSolutions('TEMPO_ESGOTADO')),
          { once: true },
        );
      });
      temporizador = setTimeout(() => controlador.abort(), tempoRestante);
      const corpo = await Promise.race([
        this.executor(caminho, parametros, controlador.signal),
        prazoEsgotado,
      ]);
      this.falhasConsecutivas = 0;
      return corpo;
    } catch (erro) {
      if (
        erro instanceof ErroTransporteMkSolutions &&
        erro.codigo === 'CIRCUITO_ABERTO'
      ) {
        throw erro;
      }
      this.registrarFalha();
      if (erro instanceof ErroTransporteMkSolutions) throw erro;
      throw new ErroTransporteMkSolutions('REDE_INDISPONIVEL');
    } finally {
      if (temporizador !== undefined) clearTimeout(temporizador);
      this.liberarVaga();
    }
  }

  private async executar(
    caminho: string,
    parametros: Readonly<Record<string, string>>,
    sinal: AbortSignal,
  ): Promise<unknown> {
    const enderecos = await lookup(this.configuracao.hostPermitido, {
      all: true,
      verbatim: true,
    }).catch(() => {
      throw new ErroTransporteMkSolutions('DNS_NAO_CONFIAVEL');
    });
    if (sinal.aborted) {
      throw new ErroTransporteMkSolutions('TEMPO_ESGOTADO');
    }
    if (
      enderecos.length === 0 ||
      enderecos.some(({ address }) => !enderecoRedePublica(address))
    ) {
      throw new ErroTransporteMkSolutions('DNS_NAO_CONFIAVEL');
    }
    const endereco = enderecos[0]!;
    const busca = new URLSearchParams(parametros);
    const porta = this.configuracao.origem.port
      ? Number(this.configuracao.origem.port)
      : 443;
    const lookupFixo = criarLookupFixo(endereco);
    const opcoes: RequestOptions = {
      headers: {
        accept: 'application/json, text/plain;q=0.9',
        'accept-encoding': 'identity',
        'user-agent': 'Vyntra-Omni/1.0',
      },
      hostname: this.configuracao.hostPermitido,
      lookup: lookupFixo,
      maxHeaderSize: MAXIMO_CABECALHO_BYTES,
      method: 'GET',
      minVersion: 'TLSv1.2',
      path: `${caminho}?${busca.toString()}`,
      port: porta,
      protocol: 'https:',
      rejectUnauthorized: true,
      servername: this.configuracao.hostPermitido,
      signal: sinal,
    };

    return new Promise<unknown>((resolver, rejeitar) => {
      const requisicao = request(opcoes, (resposta) => {
        const status = resposta.statusCode ?? 0;
        if (status !== 200) {
          resposta.resume();
          rejeitar(new ErroTransporteMkSolutions('HTTP_INESPERADO'));
          return;
        }
        const tipo = String(resposta.headers['content-type'] ?? '')
          .split(';', 1)[0]
          ?.trim()
          .toLowerCase();
        if (tipo !== 'application/json' && tipo !== 'text/plain') {
          resposta.resume();
          rejeitar(new ErroTransporteMkSolutions('RESPOSTA_INVALIDA'));
          return;
        }
        const partes: Buffer[] = [];
        let tamanho = 0;
        resposta.on('data', (parte: Buffer) => {
          tamanho += parte.byteLength;
          if (tamanho > this.configuracao.limiteCorpoBytes) {
            resposta.destroy(
              new ErroTransporteMkSolutions('CORPO_EXCESSIVO'),
            );
            return;
          }
          partes.push(parte);
        });
        resposta.on('error', (erro) => rejeitar(erro));
        resposta.on('end', () => {
          try {
            resolver(JSON.parse(Buffer.concat(partes).toString('utf8')));
          } catch {
            rejeitar(new ErroTransporteMkSolutions('RESPOSTA_INVALIDA'));
          }
        });
      });
      requisicao.setTimeout(this.configuracao.tempoEsperaMs, () => {
        requisicao.destroy(new ErroTransporteMkSolutions('TEMPO_ESGOTADO'));
      });
      requisicao.once('error', (erro) => rejeitar(erro));
      requisicao.end();
    });
  }

  private async adquirirVaga(): Promise<void> {
    if (this.emAndamento < this.configuracao.limiteConcorrencia) {
      this.emAndamento += 1;
      return;
    }
    if (this.aguardando.length >= this.configuracao.limiteConcorrencia * 16) {
      throw new ErroTransporteMkSolutions('REDE_INDISPONIVEL');
    }
    await new Promise<void>((resolver, rejeitar) => {
      const liberar = (): void => {
        clearTimeout(temporizador);
        resolver();
      };
      const temporizador = setTimeout(() => {
        const indice = this.aguardando.indexOf(liberar);
        if (indice >= 0) this.aguardando.splice(indice, 1);
        rejeitar(new ErroTransporteMkSolutions('TEMPO_ESGOTADO'));
      }, this.configuracao.tempoEsperaMs);
      this.aguardando.push(liberar);
    });
  }

  private liberarVaga(): void {
    const proxima = this.aguardando.shift();
    if (proxima === undefined) {
      this.emAndamento -= 1;
      return;
    }
    proxima();
  }

  private registrarFalha(): void {
    this.falhasConsecutivas += 1;
    if (this.falhasConsecutivas >= FALHAS_ATE_ABRIR_CIRCUITO) {
      this.circuitoAbertoAte = Date.now() + PAUSA_CIRCUITO_MS;
      this.falhasConsecutivas = 0;
    }
  }
}

export function criarLookupFixo(
  endereco: Readonly<{ address: string; family: number }>,
): LookupFunction {
  return (_hostname, opcoes, callback) => {
    if (opcoes.all === true) {
      callback(null, [{ address: endereco.address, family: endereco.family }]);
      return;
    }
    callback(null, endereco.address, endereco.family);
  };
}

export function enderecoRedePublica(endereco: string): boolean {
  const familia = isIP(endereco);
  if (familia === 4) {
    const partes = endereco.split('.').map(Number);
    const [a = 0, b = 0, c = 0] = partes;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (familia !== 6) return false;
  const normalizado = endereco.toLowerCase();
  if (normalizado.startsWith('::ffff:')) {
    return enderecoRedePublica(normalizado.slice('::ffff:'.length));
  }
  const primeiroHexteto = Number.parseInt(normalizado.split(':', 1)[0] ?? '', 16);
  return !(
    normalizado === '::' ||
    normalizado === '::1' ||
    !Number.isInteger(primeiroHexteto) ||
    primeiroHexteto < 0x2000 ||
    primeiroHexteto > 0x3fff ||
    normalizado.startsWith('2001:db8:')
  );
}
