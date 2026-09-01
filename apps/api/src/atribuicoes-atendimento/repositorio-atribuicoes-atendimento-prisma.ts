import { Injectable } from '@nestjs/common';

import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { RepositorioAtribuicoesAtendimento } from './repositorio-atribuicoes-atendimento.js';

@Injectable()
export class RepositorioAtribuicoesAtendimentoPrisma
  implements RepositorioAtribuicoesAtendimento
{
  public async obter(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<AtendimentoPersistido | undefined> {
    const atendimento = await transacao.atendimento.findUnique({
      where: { id: atendimentoId },
    });
    if (atendimento === null) return undefined;
    return {
      atualizadoEm: atendimento.atualizadoEm,
      contaWhatsAppOrigemId: atendimento.contaWhatsAppOrigemId,
      conversaId: atendimento.conversaId,
      estado: atendimento.estado,
      id: atendimento.id,
      iniciadoEm: atendimento.iniciadoEm,
      modo: atendimento.modo,
      motivoEspera: atendimento.motivoEspera,
      versaoAtribuicao: atendimento.versaoAtribuicao,
      versaoEstado: atendimento.versaoEstado,
      ...(atendimento.encerradoEm === null
        ? {}
        : { encerradoEm: atendimento.encerradoEm }),
      ...(atendimento.encerradoPorId === null
        ? {}
        : { encerradoPorId: atendimento.encerradoPorId }),
      ...(atendimento.encerradoPorTipo === null
        ? {}
        : { encerradoPorTipo: atendimento.encerradoPorTipo }),
      ...(atendimento.filaAtualId === null
        ? {}
        : { filaAtualId: atendimento.filaAtualId }),
      ...(atendimento.filaFallbackReaberturaId === null
        ? {}
        : { filaFallbackReaberturaId: atendimento.filaFallbackReaberturaId }),
      ...(atendimento.finalizadoDefinitivamenteEm === null
        ? {}
        : {
            finalizadoDefinitivamenteEm:
              atendimento.finalizadoDefinitivamenteEm,
          }),
      ...(atendimento.motivoEncerramento === null
        ? {}
        : { motivoEncerramento: atendimento.motivoEncerramento }),
      ...(atendimento.podeReabrirAte === null
        ? {}
        : { podeReabrirAte: atendimento.podeReabrirAte }),
      ...(atendimento.usuarioResponsavelId === null
        ? {}
        : { usuarioResponsavelId: atendimento.usuarioResponsavelId }),
    };
  }

  public async resgatarCondicional(
    proximo: AtendimentoPersistido,
    filaEsperadaId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.atendimento.updateMany({
      data: {
        atualizadoEm: proximo.atualizadoEm,
        estado: 'EM_ATENDIMENTO',
        modo: 'HUMANO',
        motivoEspera: 'NENHUM',
        usuarioResponsavelId: proximo.usuarioResponsavelId!,
        versaoAtribuicao: proximo.versaoAtribuicao,
        versaoEstado: proximo.versaoEstado,
      },
      where: {
        estado: 'AGUARDANDO',
        filaAtualId: filaEsperadaId,
        id: proximo.id,
        modo: 'FILA_HUMANA',
        usuarioResponsavelId: null,
        versaoAtribuicao: versaoAtribuicaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  public async transferirParaFilaCondicional(
    proximo: AtendimentoPersistido,
    filaOrigemEsperadaId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.atendimento.updateMany({
      data: {
        atualizadoEm: proximo.atualizadoEm,
        estado: 'AGUARDANDO',
        filaAtualId: proximo.filaAtualId!,
        modo: 'FILA_HUMANA',
        motivoEspera: 'AGUARDANDO_HUMANO',
        usuarioResponsavelId: null,
        versaoAtribuicao: proximo.versaoAtribuicao,
        versaoEstado: proximo.versaoEstado,
      },
      where: {
        estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
        filaAtualId: filaOrigemEsperadaId,
        id: proximo.id,
        versaoAtribuicao: versaoAtribuicaoEsperada,
      },
    });
    return resultado.count === 1;
  }
}
