import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { RepositorioComposicoesSegundaVia } from './repositorio-composicoes-segunda-via.js';
import type { ComposicaoSegundaVia } from './segunda-via.js';

@Injectable()
export class RepositorioComposicoesSegundaViaPrisma
  implements RepositorioComposicoesSegundaVia
{
  public async acrescentar(
    composicao: ComposicaoSegundaVia,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.composicaoSegundaVia.create({
      data: {
        contaWhatsAppId: composicao.contaWhatsAppId,
        contatoId: composicao.contatoId,
        criadaEm: composicao.criadaEm,
        documentoMidiaMensagemId:
          composicao.documentoMidiaMensagemId ?? null,
        id: composicao.id,
        incluiLinhaDigitavel: composicao.incluiLinhaDigitavel,
        incluiLinkSeguro: composicao.incluiLinkSeguro,
        incluiPdf: composicao.incluiPdf,
        incluiPix: composicao.incluiPix,
        opcoesHash: composicao.opcoesHash,
        opcoesProtegidas: composicao.opcoesProtegidas,
        referenciaFatura: composicao.referenciaFatura,
        valorCentavos: BigInt(composicao.valorCentavos),
        vencimento: composicao.vencimento,
      },
    });
  }
}
