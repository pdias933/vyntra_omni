import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlertaJanelaCanalEmitido,
  JanelaCanalPersistida,
} from './modelo-janela-canal.js';
import type { RepositorioJanelaCanal } from './repositorio-janela-canal.js';

@Injectable()
export class RepositorioJanelaCanalPrisma implements RepositorioJanelaCanal {
  public async bloquear(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`janela-canal\u0000${contatoId}\u0000${contaWhatsAppId}`}, 0))`,
    );
  }

  public async alvosValidos(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const [contato, conta] = await Promise.all([
      transacao.contato.findUnique({ select: { id: true }, where: { id: contatoId } }),
      transacao.contaWhatsApp.findFirst({
        select: { id: true },
        where: { estado: 'ATIVA', id: contaWhatsAppId },
      }),
    ]);
    return contato !== null && conta !== null;
  }

  public async obter(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
  ): Promise<JanelaCanalPersistida | undefined> {
    const janela = await transacao.janelaAtendimentoCanal.findUnique({
      where: { contatoId_contaWhatsAppId: { contatoId, contaWhatsAppId } },
    });
    return janela ?? undefined;
  }

  public async criar(
    janela: JanelaCanalPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.janelaAtendimentoCanal.create({ data: janela });
  }

  public async atualizarSeEntradaMaisNova(
    janela: JanelaCanalPersistida,
    ultimaEntradaAnterior: Date,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.janelaAtendimentoCanal.updateMany({
      data: {
        atualizadaEm: janela.atualizadaEm,
        expiraEm: janela.expiraEm,
        ultimaEntradaContatoEm: janela.ultimaEntradaContatoEm,
        versao: janela.versao,
      },
      where: {
        id: janela.id,
        ultimaEntradaContatoEm: ultimaEntradaAnterior,
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  public async registrarAlerta(
    alerta: AlertaJanelaCanalEmitido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.alertaJanelaCanal.createMany({
      data: [alerta],
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }
}
