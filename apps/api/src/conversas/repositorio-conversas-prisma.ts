import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ConversaPersistida,
  ParticipacaoContaConversaPersistida,
} from './modelo-conversa.js';
import type { RepositorioConversas } from './repositorio-conversas.js';

@Injectable()
export class RepositorioConversasPrisma implements RepositorioConversas {
  public async bloquearContato(
    contatoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conversa\u0000${contatoId}`}, 0))`,
    );
  }

  public async contatoExiste(
    contatoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.contato.findUnique({
        select: { id: true },
        where: { id: contatoId },
      })) !== null
    );
  }

  public async contaEstaAtiva(
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.contaWhatsApp.findFirst({
        select: { id: true },
        where: { estado: 'ATIVA', id: contaWhatsAppId },
      })) !== null
    );
  }

  public async obterPorContato(
    contatoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ConversaPersistida | undefined> {
    const conversa = await transacao.conversa.findUnique({
      where: { contatoId },
    });
    return conversa ?? undefined;
  }

  public async criar(
    conversa: ConversaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.conversa.create({ data: conversa });
  }

  public async atualizar(
    conversa: ConversaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.conversa.updateMany({
      data: conversa,
      where: {
        contatoId: conversa.contatoId,
        id: conversa.id,
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  public async obterParticipacao(
    conversaId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<ParticipacaoContaConversaPersistida | undefined> {
    const participacao = await transacao.participacaoContaConversa.findUnique({
      where: { conversaId_contaWhatsAppId: { contaWhatsAppId, conversaId } },
    });
    return participacao ?? undefined;
  }

  public async criarParticipacao(
    participacao: ParticipacaoContaConversaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.participacaoContaConversa.create({ data: participacao });
  }

  public async atualizarParticipacao(
    participacao: ParticipacaoContaConversaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.participacaoContaConversa.updateMany({
      data: participacao,
      where: {
        contaWhatsAppId: participacao.contaWhatsAppId,
        conversaId: participacao.conversaId,
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
  }
}
