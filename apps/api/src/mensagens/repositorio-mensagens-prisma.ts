import { Injectable } from '@nestjs/common';

import type { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSaidaMensagem,
  MensagemSaidaPersistida,
} from './modelo-mensagem.js';
import type { RepositorioMensagens } from './repositorio-mensagens.js';

@Injectable()
export class RepositorioMensagensPrisma implements RepositorioMensagens {
  public async bloquearIdempotencia(
    usuarioId: string,
    mensagemClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${usuarioId}:${mensagemClienteId}`}, 0))`;
  }

  public async obterPorIdempotencia(
    usuarioId: string,
    mensagemClienteId: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemSaidaPersistida | undefined> {
    const mensagem = await transacao.mensagem.findFirst({
      where: { mensagemClienteId, usuarioRemetenteId: usuarioId },
    });
    return mensagem === null
      ? undefined
      : (mensagem as unknown as MensagemSaidaPersistida);
  }

  public async obterContextoSaida(
    conversaId: string,
    atendimentoId: string,
    contaWhatsAppId: string,
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSaidaMensagem | undefined> {
    const atendimento = await transacao.atendimento.findFirst({
      select: {
        contaWhatsAppOrigemId: true,
        conversa: { select: { contatoId: true } },
        filaAtualId: true,
      },
      where: {
        contaWhatsAppOrigemId: contaWhatsAppId,
        conversaId,
        estado: 'EM_ATENDIMENTO',
        filaAtualId: filaId,
        id: atendimentoId,
        modo: 'HUMANO',
        usuarioResponsavelId: usuarioId,
      },
    });
    if (atendimento === null) return undefined;
    return {
      contaWhatsAppId: atendimento.contaWhatsAppOrigemId,
      contatoId: atendimento.conversa.contatoId,
      filaId: atendimento.filaAtualId as string,
      permiteEnvio: true,
    };
  }

  public async acrescentar(
    mensagem: MensagemSaidaPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.mensagem.create({
      data: mensagem as unknown as Prisma.MensagemUncheckedCreateInput,
    });
  }
}
