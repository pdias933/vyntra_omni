import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../../../persistencia/transacao-prisma.js';
import type {
  MensagemEntradaPersistir,
  RecepcaoEntradaMetaCloud,
  RepositorioEntradaMetaCloud,
} from './repositorio-entrada-meta-cloud.js';

@Injectable()
export class RepositorioEntradaMetaCloudPrisma implements RepositorioEntradaMetaCloud {
  public async obterContaAtiva(
    identificadorCanalExterno: string,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly id: string } | undefined> {
    const conta = await transacao.contaWhatsApp.findFirst({
      select: { id: true },
      where: { estado: 'ATIVA', identificadorCanalExterno },
    });
    return conta ?? undefined;
  }

  public async registrarRecepcaoSeNova(
    entrada: RecepcaoEntradaMetaCloud,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      await transacao.eventoEntradaCanal.createMany({
        data: { ...entrada, estado: 'RECEBIDO' },
        skipDuplicates: true,
      })
    ).count === 1;
  }

  public async obterOuCriarAtendimento(
    conversaId: string,
    contaWhatsAppId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly id: string; readonly criado: boolean }> {
    await transacao.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${conversaId}, 0))`;
    const atual = await transacao.atendimento.findFirst({
      orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }],
      select: { id: true },
      where: { conversaId, estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADO_REABRIVEL'] } },
    });
    if (atual !== null) return { criado: false, id: atual.id };
    const id = randomUUID();
    await transacao.atendimento.create({
      data: {
        atualizadoEm: agora,
        contaWhatsAppOrigemId: contaWhatsAppId,
        conversaId,
        estado: 'AGUARDANDO',
        id,
        iniciadoEm: agora,
        modo: 'BOT',
        motivoEspera: 'PROCESSANDO_BOT',
        versaoAtribuicao: 1,
        versaoEstado: 1,
      },
    });
    return { criado: true, id };
  }

  public async acrescentarMensagem(
    mensagem: MensagemEntradaPersistir,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.mensagem.create({
      data: {
        ...mensagem,
        direcao: 'ENTRADA',
        tipo: 'TEXTO',
      },
    });
  }

  public async marcarPersistida(
    recepcaoId: string,
    mensagemId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const resultado = await transacao.eventoEntradaCanal.updateMany({
      data: { estado: 'PERSISTIDO', mensagemId, persistidoEm: agora },
      where: { estado: 'RECEBIDO', id: recepcaoId, mensagemId: null },
    });
    if (resultado.count !== 1) throw new Error('RECEPCAO_META_CLOUD_CONCORRENTE');
  }
}
