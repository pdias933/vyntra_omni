import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroConflitoConversa,
  ErroEntradaConversaInvalida,
  ErroOrigemConversaIndisponivel,
} from './erros-conversa.js';
import type {
  ConversaPersistida,
  EntradaResolucaoConversa,
  ParticipacaoContaConversaPersistida,
  ResultadoResolucaoConversa,
} from './modelo-conversa.js';
import {
  REPOSITORIO_CONVERSAS,
  type RepositorioConversas,
} from './repositorio-conversas.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoConversas {
  public constructor(
    @Inject(REPOSITORIO_CONVERSAS)
    private readonly repositorio: RepositorioConversas,
  ) {}

  public async obterOuCriar(
    entrada: EntradaResolucaoConversa,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoResolucaoConversa> {
    const agora = relogio();
    this.validarEntrada(entrada, agora);
    await this.repositorio.bloquearContato(entrada.contatoId, transacao);
    const contatoExiste = await this.repositorio.contatoExiste(
      entrada.contatoId,
      transacao,
    );
    const contaEstaAtiva = await this.repositorio.contaEstaAtiva(
      entrada.contaWhatsAppId,
      transacao,
    );
    if (!contatoExiste || !contaEstaAtiva) {
      throw new ErroOrigemConversaIndisponivel();
    }

    const encontrada = await this.repositorio.obterPorContato(
      entrada.contatoId,
      transacao,
    );
    const conversaCriada = encontrada === undefined;
    let conversa =
      encontrada ??
      this.criarConversa(entrada.contatoId, entrada.interacaoEm, agora);
    if (encontrada === undefined) {
      await this.repositorio.criar(conversa, transacao);
    } else if (agora < encontrada.atualizadaEm) {
      throw new ErroEntradaConversaInvalida();
    }

    const registrada = await this.registrarParticipacao(
      conversa.id,
      entrada,
      transacao,
    );
    if (!conversaCriada && entrada.interacaoEm > conversa.ultimaAtividadeEm) {
      const anterior = conversa;
      conversa = {
        ...anterior,
        atualizadaEm: agora,
        ultimaAtividadeEm: entrada.interacaoEm,
        versao: anterior.versao + 1,
      };
      if (
        !(await this.repositorio.atualizar(
          conversa,
          anterior.versao,
          transacao,
        ))
      ) {
        throw new ErroConflitoConversa();
      }
    }

    return {
      conversa,
      conversaCriada,
      origemRegistrada: registrada.origemRegistrada,
      participacao: registrada.participacao,
    };
  }

  private async registrarParticipacao(
    conversaId: string,
    entrada: EntradaResolucaoConversa,
    transacao: TransacaoPrisma,
  ): Promise<{
    readonly origemRegistrada: boolean;
    readonly participacao: ParticipacaoContaConversaPersistida;
  }> {
    const existente = await this.repositorio.obterParticipacao(
      conversaId,
      entrada.contaWhatsAppId,
      transacao,
    );
    if (existente === undefined) {
      const participacao: ParticipacaoContaConversaPersistida = {
        contaWhatsAppId: entrada.contaWhatsAppId,
        conversaId,
        primeiraInteracaoEm: entrada.interacaoEm,
        ultimaInteracaoEm: entrada.interacaoEm,
        versao: 1,
      };
      await this.repositorio.criarParticipacao(participacao, transacao);
      return { origemRegistrada: true, participacao };
    }
    const primeiraInteracaoEm =
      entrada.interacaoEm < existente.primeiraInteracaoEm
        ? entrada.interacaoEm
        : existente.primeiraInteracaoEm;
    const ultimaInteracaoEm =
      entrada.interacaoEm > existente.ultimaInteracaoEm
        ? entrada.interacaoEm
        : existente.ultimaInteracaoEm;
    if (
      primeiraInteracaoEm === existente.primeiraInteracaoEm &&
      ultimaInteracaoEm === existente.ultimaInteracaoEm
    ) {
      return { origemRegistrada: false, participacao: existente };
    }
    const participacao = {
      ...existente,
      primeiraInteracaoEm,
      ultimaInteracaoEm,
      versao: existente.versao + 1,
    };
    if (
      !(await this.repositorio.atualizarParticipacao(
        participacao,
        existente.versao,
        transacao,
      ))
    ) {
      throw new ErroConflitoConversa();
    }
    return { origemRegistrada: false, participacao };
  }

  private criarConversa(
    contatoId: string,
    interacaoEm: Date,
    agora: Date,
  ): ConversaPersistida {
    return {
      atualizadaEm: agora,
      contatoId,
      criadaEm: agora,
      id: randomUUID(),
      ultimaAtividadeEm: interacaoEm,
      versao: 1,
    };
  }

  private validarEntrada(entrada: EntradaResolucaoConversa, agora: Date): void {
    if (
      !UUID.test(entrada.contatoId) ||
      !UUID.test(entrada.contaWhatsAppId) ||
      !(entrada.interacaoEm instanceof Date) ||
      Number.isNaN(entrada.interacaoEm.getTime()) ||
      Number.isNaN(agora.getTime()) ||
      entrada.interacaoEm > agora
    ) {
      throw new ErroEntradaConversaInvalida();
    }
  }
}
