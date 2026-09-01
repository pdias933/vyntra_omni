import { Injectable } from '@nestjs/common';

import type { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { CategoriaMidia, MidiaMensagemPersistida } from './modelo-midia.js';
import type { RepositorioMidias } from './repositorio-midias.js';

@Injectable()
export class RepositorioMidiasPrisma implements RepositorioMidias {
  public async mensagemAceitaMidia(
    mensagemId: string,
    categoria: CategoriaMidia,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (await transacao.mensagem.count({ where: { id: mensagemId, tipo: categoria } })) === 1;
  }

  public async acrescentar(
    midia: MidiaMensagemPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.midiaMensagem.create({
      data: midia as unknown as Prisma.MidiaMensagemUncheckedCreateInput,
    });
  }
}
