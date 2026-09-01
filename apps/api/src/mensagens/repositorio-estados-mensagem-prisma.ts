import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { RecepcaoEstadoMensagem } from './modelo-estado-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';
import type { RepositorioEstadosMensagem } from './repositorio-estados-mensagem.js';

@Injectable()
export class RepositorioEstadosMensagemPrisma
  implements RepositorioEstadosMensagem
{
  public async obterMensagem(
    contaWhatsAppId: string,
    identificadorMensagemExterno: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemSaidaPersistida | undefined> {
    const mensagem = await transacao.mensagem.findFirst({
      where: {
        contaWhatsAppId,
        direcao: 'SAIDA',
        identificadorExternoMensagem: identificadorMensagemExterno,
      },
    });
    return mensagem === null
      ? undefined
      : (mensagem as unknown as MensagemSaidaPersistida);
  }

  public async registrarRecepcao(
    recepcao: RecepcaoEstadoMensagem,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.eventoEstadoMensagem.createMany({
      data: {
        aplicado: false,
        codigoFalha: recepcao.codigoFalha ?? null,
        contaWhatsAppId: recepcao.contaWhatsAppId,
        estado: recepcao.estado,
        id: recepcao.id,
        identificadorEventoExterno: recepcao.identificadorEventoExterno,
        mensagemId: recepcao.mensagemId,
        ocorridoEm: recepcao.ocorridoEm,
        recebidoEm: recepcao.recebidoEm,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async atualizarMensagem(
    mensagem: MensagemSaidaPersistida,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.mensagem.updateMany({
      data: {
        codigoFalha: mensagem.codigoFalha ?? null,
        entregueEm: mensagem.entregueEm ?? null,
        estadoSaida: mensagem.estadoSaida,
        falhouEm: mensagem.falhouEm ?? null,
        lidaEm: mensagem.lidaEm ?? null,
        versao: mensagem.versao,
      },
      where: { id: mensagem.id, versao: versaoEsperada },
    });
    return resultado.count === 1;
  }

  public async marcarAplicado(
    recepcaoId: string,
    aplicadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.eventoEstadoMensagem.update({
      data: { aplicado: true, aplicadoEm },
      where: { id: recepcaoId },
    });
  }
}
