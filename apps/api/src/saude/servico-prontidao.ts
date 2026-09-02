import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';

export interface ResultadoProntidao {
  readonly falhas: readonly string[];
  readonly pronto: boolean;
}

interface AlvoDependencia {
  readonly componente: string;
  readonly endereco: string;
  readonly porta: number;
}

const AMBIENTES_ESTRITOS = new Set(['desenvolvimento', 'producao', 'staging']);
const TEMPO_LIMITE_MS = 1_000;

async function lerSegredo(caminho: string | undefined): Promise<string | undefined> {
  if (caminho === undefined) {
    return undefined;
  }

  const valor = (await readFile(caminho, 'utf8')).trim();
  return valor.length > 0 ? valor : undefined;
}

function criarAlvo(
  componente: string,
  enderecoUrl: string,
  protocolos: ReadonlySet<string>,
  portaPadrao: number,
): AlvoDependencia {
  const endereco = new URL(enderecoUrl);

  if (!protocolos.has(endereco.protocol) || endereco.hostname.length === 0) {
    throw new Error(`CONFIGURACAO_${componente}_INVALIDA`);
  }

  const porta =
    endereco.port.length > 0
      ? Number(endereco.port)
      : endereco.protocol === 'https:'
        ? 443
        : portaPadrao;
  if (!Number.isInteger(porta) || porta < 1 || porta > 65_535) {
    throw new Error(`PORTA_${componente}_INVALIDA`);
  }

  return { componente, endereco: endereco.hostname, porta };
}

function criarAlvoHost(
  componente: string,
  endereco: string,
  porta: number,
): AlvoDependencia {
  if (
    endereco.trim().length === 0 ||
    !Number.isInteger(porta) ||
    porta < 1 ||
    porta > 65_535
  ) {
    throw new Error(`CONFIGURACAO_${componente}_INVALIDA`);
  }

  return { componente, endereco: endereco.trim(), porta };
}

async function conectar(alvo: AlvoDependencia): Promise<boolean> {
  return new Promise((resolver) => {
    const socket = createConnection({ host: alvo.endereco, port: alvo.porta });
    let concluido = false;

    const concluir = (resultado: boolean): void => {
      if (concluido) {
        return;
      }
      concluido = true;
      socket.destroy();
      resolver(resultado);
    };

    socket.setTimeout(TEMPO_LIMITE_MS);
    socket.once('connect', () => concluir(true));
    socket.once('error', () => concluir(false));
    socket.once('timeout', () => concluir(false));
  });
}

@Injectable()
export class ServicoProntidao {
  private drenando = false;

  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async verificar(): Promise<ResultadoProntidao> {
    if (this.drenando) {
      return { falhas: ['DRENAGEM_APLICACAO'], pronto: false };
    }
    try {
      const alvos = await this.obterAlvos();
      const resultados = await Promise.all(
        alvos.map(async (alvo) => ({
          componente: alvo.componente,
          disponivel: await conectar(alvo),
        })),
      );
      const falhas = resultados
        .filter(({ disponivel }) => !disponivel)
        .map(({ componente }) => componente);

      const postgresqlDisponivel = resultados.some(
        ({ componente, disponivel }) => componente === 'POSTGRESQL' && disponivel,
      );
      if (
        postgresqlDisponivel &&
        !(await this.prisma.verificarMigracaoObrigatoria())
      ) {
        falhas.push('MIGRACAO_POSTGRESQL');
      }

      return { falhas, pronto: falhas.length === 0 };
    } catch {
      return {
        falhas: ['CONFIGURACAO_DEPENDENCIA_INVALIDA'],
        pronto: false,
      };
    }
  }

  public iniciarDrenagem(): void {
    this.drenando = true;
  }

  private async obterAlvos(): Promise<AlvoDependencia[]> {
    const ambiente = process.env.AMBIENTE_APLICACAO?.toLowerCase();
    const estrito = ambiente !== undefined && AMBIENTES_ESTRITOS.has(ambiente);
    const banco = await lerSegredo(process.env.BANCO_URL_FILE);
    const redis = await lerSegredo(process.env.REDIS_URL_FILE);
    const storage = process.env.STORAGE_ENDPOINT?.trim();
    const alvos: AlvoDependencia[] = [];

    if (banco !== undefined) {
      alvos.push(
        criarAlvo(
          'POSTGRESQL',
          banco,
          new Set(['postgres:', 'postgresql:']),
          5432,
        ),
      );
    } else if (process.env.BANCO_HOST !== undefined) {
      alvos.push(
        criarAlvoHost(
          'POSTGRESQL',
          process.env.BANCO_HOST,
          Number(process.env.BANCO_PORTA ?? '5432'),
        ),
      );
    }
    if (redis !== undefined) {
      alvos.push(
        criarAlvo('REDIS', redis, new Set(['redis:', 'rediss:']), 6379),
      );
    } else if (process.env.REDIS_HOST !== undefined) {
      alvos.push(
        criarAlvoHost(
          'REDIS',
          process.env.REDIS_HOST,
          Number(process.env.REDIS_PORTA ?? '6379'),
        ),
      );
    }
    if (storage) {
      alvos.push(
        criarAlvo('STORAGE', storage, new Set(['http:', 'https:']), 80),
      );
    }

    if (
      estrito &&
      !['POSTGRESQL', 'REDIS', 'STORAGE'].every((componente) =>
        alvos.some((alvo) => alvo.componente === componente),
      )
    ) {
      throw new Error('DEPENDENCIA_OBRIGATORIA_NAO_CONFIGURADA');
    }

    return alvos;
  }
}
