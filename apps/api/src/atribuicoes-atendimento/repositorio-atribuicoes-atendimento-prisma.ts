import { Injectable } from '@nestjs/common';

import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import { Prisma } from '../gerado/prisma/client.js';
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

  public async destinatarioEstaDisponivel(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return (
      (await transacao.disponibilidadeUsuario.findFirst({
        select: { usuarioId: true },
        where: { estado: 'DISPONIVEL', usuarioId },
      })) !== null
    );
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

  public async transferirParaUsuarioCondicional(
    proximo: AtendimentoPersistido,
    filaOrigemEsperadaId: string,
    filaDestinoId: string,
    destinatarioId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const quantidade = await transacao.$executeRaw(
      Prisma.sql`
        UPDATE "atendimento"
        SET
          "estado" = 'EM_ATENDIMENTO'::"estado_atendimento",
          "modo" = 'HUMANO'::"modo_atendimento",
          "motivo_espera" = 'NENHUM'::"motivo_espera_atendimento",
          "fila_atual_id" = ${filaDestinoId}::uuid,
          "usuario_responsavel_id" = ${destinatarioId}::uuid,
          "versao_estado" = ${proximo.versaoEstado},
          "versao_atribuicao" = ${proximo.versaoAtribuicao},
          "atualizado_em" = ${proximo.atualizadoEm}
        WHERE "id" = ${proximo.id}::uuid
          AND "estado" IN (
            'AGUARDANDO'::"estado_atendimento",
            'EM_ATENDIMENTO'::"estado_atendimento"
          )
          AND "fila_atual_id" = ${filaOrigemEsperadaId}::uuid
          AND "versao_atribuicao" = ${versaoAtribuicaoEsperada}
          AND EXISTS (
            SELECT 1 FROM "disponibilidade_usuario" d
            WHERE d."usuario_id" = ${destinatarioId}::uuid
              AND d."estado" = 'DISPONIVEL'::"estado_disponibilidade_usuario"
          )
      `,
    );
    return quantidade === 1;
  }
}
