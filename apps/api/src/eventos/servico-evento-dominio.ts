import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { SanitizadorDadosProtegidos } from '../seguranca/sanitizador-dados-protegidos.js';
import {
  CLASSIFICACOES_DADOS_EVENTO,
  type EntradaEventoDominio,
  type EventoDominio,
  type NovoEventoDominio,
} from './modelo-eventos.js';
import {
  REPOSITORIO_EVENTO_DOMINIO,
  type RepositorioEventoDominio,
} from './repositorio-evento-dominio.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NOME_CANONICO = /^[A-Z][A-Z0-9_]{2,99}$/u;

@Injectable()
export class ServicoEventoDominio {
  private readonly sanitizador = new SanitizadorDadosProtegidos();

  public constructor(
    @Inject(REPOSITORIO_EVENTO_DOMINIO)
    private readonly repositorio: RepositorioEventoDominio,
  ) {}

  public async acrescentar(
    entrada: EntradaEventoDominio,
    transacao: TransacaoPrisma,
  ): Promise<EventoDominio> {
    this.validar(entrada);
    const novoEvento: NovoEventoDominio = {
      atendimentoId: entrada.atendimentoId,
      classificacaoDados: entrada.classificacaoDados,
      conversaId: entrada.conversaId,
      criadoEm: new Date(),
      dadosProtegidosMinimizados: this.sanitizador.sanitizar(entrada.dados) ?? {},
      entidadeId: entrada.entidadeId,
      entidadeTipo: entrada.entidadeTipo,
      id: randomUUID(),
      tipo: entrada.tipo,
      usuarioAtorId: entrada.usuarioAtorId,
    };
    const sequenciaEvento = await this.repositorio.acrescentar(
      novoEvento,
      transacao,
    );

    return { ...novoEvento, sequenciaEvento };
  }

  private validar(entrada: EntradaEventoDominio): void {
    if (
      !NOME_CANONICO.test(entrada.tipo) ||
      !NOME_CANONICO.test(entrada.entidadeTipo)
    ) {
      throw new Error('EVENTO_DOMINIO_INVALIDO');
    }
    if (!CLASSIFICACOES_DADOS_EVENTO.includes(entrada.classificacaoDados)) {
      throw new Error('CLASSIFICACAO_DADOS_EVENTO_INVALIDA');
    }
    for (const valor of [
      entrada.entidadeId,
      entrada.atendimentoId,
      entrada.conversaId,
      entrada.usuarioAtorId,
    ]) {
      if (valor !== undefined && !IDENTIFICADOR_UUID.test(valor)) {
        throw new Error('IDENTIFICADOR_EVENTO_DOMINIO_INVALIDO');
      }
    }
  }
}
