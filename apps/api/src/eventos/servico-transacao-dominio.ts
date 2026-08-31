import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  EntradaEventoDominio,
  EntradaItemCaixaSaida,
  EventoDominio,
  ItemCaixaSaida,
} from './modelo-eventos.js';
import { ServicoCaixaSaida } from './servico-caixa-saida.js';
import { ServicoEventoDominio } from './servico-evento-dominio.js';

const ITENS_CAIXA_SAIDA_MAXIMOS = 20;

export interface EntradaTransacaoDominio<ResultadoAlteracao> {
  readonly alterar: (transacao: TransacaoPrisma) => Promise<ResultadoAlteracao>;
  readonly criarEvento: (
    resultado: ResultadoAlteracao,
  ) => EntradaEventoDominio;
  readonly criarItensCaixaSaida: (
    resultado: ResultadoAlteracao,
    evento: EventoDominio,
  ) => readonly EntradaItemCaixaSaida[];
}

export interface ResultadoTransacaoDominio<ResultadoAlteracao> {
  readonly resultado: ResultadoAlteracao;
  readonly evento: EventoDominio;
  readonly itensCaixaSaida: readonly ItemCaixaSaida[];
}

@Injectable()
export class ServicoTransacaoDominio {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoCaixaSaida) private readonly caixaSaida: ServicoCaixaSaida,
  ) {}

  public async executarComCaixaSaida<ResultadoAlteracao>(
    entrada: EntradaTransacaoDominio<ResultadoAlteracao>,
  ): Promise<ResultadoTransacaoDominio<ResultadoAlteracao>> {
    return this.prisma.executarTransacao(async (transacao) => {
      const resultado = await entrada.alterar(transacao);
      const evento = await this.eventos.acrescentar(
        entrada.criarEvento(resultado),
        transacao,
      );
      const entradasCaixaSaida = entrada.criarItensCaixaSaida(resultado, evento);

      if (
        entradasCaixaSaida.length === 0 ||
        entradasCaixaSaida.length > ITENS_CAIXA_SAIDA_MAXIMOS
      ) {
        throw new Error('QUANTIDADE_ITENS_CAIXA_SAIDA_INVALIDA');
      }

      const itensCaixaSaida: ItemCaixaSaida[] = [];
      for (const item of entradasCaixaSaida) {
        itensCaixaSaida.push(
          await this.caixaSaida.acrescentar(item, evento, transacao),
        );
      }

      return { evento, itensCaixaSaida, resultado };
    });
  }
}
