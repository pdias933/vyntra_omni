import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { SanitizadorDadosProtegidos } from '../seguranca/sanitizador-dados-protegidos.js';
import type {
  EntradaItemCaixaSaida,
  EventoDominio,
  ItemCaixaSaida,
} from './modelo-eventos.js';
import {
  REPOSITORIO_CAIXA_SAIDA,
  type RepositorioCaixaSaida,
} from './repositorio-caixa-saida.js';

const NOME_CANONICO = /^[A-Z][A-Z0-9_]{2,99}$/u;

@Injectable()
export class ServicoCaixaSaida {
  private readonly sanitizador = new SanitizadorDadosProtegidos();

  public constructor(
    @Inject(REPOSITORIO_CAIXA_SAIDA)
    private readonly repositorio: RepositorioCaixaSaida,
  ) {}

  public async acrescentar(
    entrada: EntradaItemCaixaSaida,
    evento: EventoDominio,
    transacao: TransacaoPrisma,
  ): Promise<ItemCaixaSaida> {
    if (!NOME_CANONICO.test(entrada.tipo) || !NOME_CANONICO.test(entrada.destino)) {
      throw new Error('ITEM_CAIXA_SAIDA_INVALIDO');
    }
    if (
      entrada.disponivelEm !== undefined &&
      Number.isNaN(entrada.disponivelEm.getTime())
    ) {
      throw new Error('DISPONIBILIDADE_CAIXA_SAIDA_INVALIDA');
    }

    const criadoEm = new Date();
    const item: ItemCaixaSaida = {
      criadoEm,
      dadosProtegidosMinimizados: this.sanitizador.sanitizar(entrada.dados) ?? {},
      destino: entrada.destino,
      disponivelEm: entrada.disponivelEm ?? criadoEm,
      estado: 'PENDENTE',
      eventoDominioId: evento.id,
      id: randomUUID(),
      tipo: entrada.tipo,
    };
    await this.repositorio.acrescentar(item, transacao);
    return item;
  }
}
