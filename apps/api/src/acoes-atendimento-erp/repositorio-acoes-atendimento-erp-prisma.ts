import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoAcaoAtendimentoErp,
  ContextoAtendimentoErpPersistido,
  RegistroAcaoAtendimentoErpPersistido,
} from './modelo-acoes-atendimento-erp.js';
import type {
  NovoRegistroAcaoAtendimentoErp,
  RepositorioAcoesAtendimentoErp,
} from './repositorio-acoes-atendimento-erp.js';

@Injectable()
export class RepositorioAcoesAtendimentoErpPrisma
  implements RepositorioAcoesAtendimentoErp
{
  public async bloquearAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`acao-atendimento-erp:${atendimentoId}`}, 0))`,
    );
  }

  public async obterNoContexto(
    contexto: ContextoAcaoAtendimentoErp,
    exigirAberto: boolean,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoErpPersistido | undefined> {
    const atendimento = await transacao.atendimento.findFirst({
      include: { protocoloErp: true },
      where: {
        ...(exigirAberto
          ? { estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] as const } }
          : {}),
        filaAtualId: contexto.filaId,
        id: contexto.atendimentoId,
        protocoloErp: {
          is: {
            estado: 'OFICIAL',
            protocoloOficial: contexto.protocoloOficial,
          },
        },
      },
    });
    return atendimento === null ? undefined : this.mapearContexto(atendimento);
  }

  public async obterPorAtendimentoEProtocolo(
    atendimentoId: string,
    protocoloOficial: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoErpPersistido | undefined> {
    const atendimento = await transacao.atendimento.findFirst({
      include: { protocoloErp: true },
      where: {
        id: atendimentoId,
        protocoloErp: {
          is: { estado: 'OFICIAL', protocoloOficial },
        },
      },
    });
    return atendimento === null ? undefined : this.mapearContexto(atendimento);
  }

  public async obterPorOperacao(
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<RegistroAcaoAtendimentoErpPersistido | undefined> {
    const registro = await transacao.registroAcaoAtendimentoErp.findUnique({
      where: { operacaoRecuperavelId: operacaoId },
    });
    if (registro === null) return undefined;
    return {
      atendimentoId: registro.atendimentoId,
      confirmadoEm: registro.confirmadoEm,
      operacaoId: registro.operacaoRecuperavelId,
      protocoloOficial: registro.protocoloOficial,
      tipo: registro.tipo,
      ...(registro.versaoAtribuicaoResultante === null
        ? {}
        : {
            versaoAtribuicaoResultante:
              registro.versaoAtribuicaoResultante,
          }),
      ...(registro.versaoEstadoResultante === null
        ? {}
        : { versaoEstadoResultante: registro.versaoEstadoResultante }),
    };
  }

  public async registrar(
    registro: NovoRegistroAcaoAtendimentoErp,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const criadoEm = new Date();
    const resultado = await transacao.registroAcaoAtendimentoErp.createMany({
      data: {
        atendimentoId: registro.atendimentoId,
        confirmadoEm: registro.confirmadoEm,
        conteudoHash: registro.conteudoHash,
        criadoEm:
          criadoEm < registro.confirmadoEm ? registro.confirmadoEm : criadoEm,
        id: randomUUID(),
        operacaoRecuperavelId: registro.operacaoId,
        protocoloOficial: registro.protocoloOficial,
        tipo: registro.tipo,
        versaoAtribuicaoResultante:
          registro.versaoAtribuicaoResultante ?? null,
        versaoEstadoResultante: registro.versaoEstadoResultante ?? null,
      },
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }

  public async reservarEncerramento(
    atendimentoId: string,
    operacaoId: string,
    versaoEstadoEsperada: number,
    versaoAtribuicaoEsperada: number,
    criadaEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    await transacao.reservaEncerramentoAtendimentoErp.createMany({
      data: {
        atendimentoId,
        criadaEm,
        operacaoRecuperavelId: operacaoId,
        versaoAtribuicaoEsperada,
        versaoEstadoEsperada,
      },
      skipDuplicates: true,
    });
    return this.reservaEncerramentoPertence(
      atendimentoId,
      operacaoId,
      transacao,
    );
  }

  public async reservaEncerramentoPertence(
    atendimentoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const reserva =
      await transacao.reservaEncerramentoAtendimentoErp.findUnique({
        select: { operacaoRecuperavelId: true },
        where: { atendimentoId },
      });
    return reserva?.operacaoRecuperavelId === operacaoId;
  }

  public async liberarReservaEncerramento(
    atendimentoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado =
      await transacao.reservaEncerramentoAtendimentoErp.deleteMany({
        where: { atendimentoId, operacaoRecuperavelId: operacaoId },
      });
    return resultado.count === 1;
  }

  public async confirmarEncerramento(
    atual: AtendimentoPersistido,
    proximo: AtendimentoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.atendimento.updateMany({
      data: {
        atualizadoEm: proximo.atualizadoEm,
        encerradoEm: proximo.encerradoEm!,
        encerradoPorId: proximo.encerradoPorId!,
        encerradoPorTipo: proximo.encerradoPorTipo!,
        estado: 'ENCERRADO_REABRIVEL',
        filaFallbackReaberturaId: null,
        finalizadoDefinitivamenteEm: null,
        motivoEncerramento: proximo.motivoEncerramento!,
        podeReabrirAte: proximo.podeReabrirAte!,
        usuarioResponsavelId: null,
        versaoAtribuicao: proximo.versaoAtribuicao,
        versaoEstado: proximo.versaoEstado,
      },
      where: {
        estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
        id: atual.id,
        versaoAtribuicao: atual.versaoAtribuicao,
        versaoEstado: atual.versaoEstado,
      },
    });
    return resultado.count === 1;
  }

  public async finalizarAtribuicaoAberta(
    atendimentoId: string,
    finalizadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const resultado = await transacao.historicoAtribuicao.updateMany({
      data: { finalizadoEm },
      where: { atendimentoId, finalizadoEm: null },
    });
    if (resultado.count !== 1) {
      throw new Error('HISTORICO_ATRIBUICAO_ENCERRAMENTO_INCONSISTENTE');
    }
  }

  private mapearContexto(atendimento: {
    atualizadoEm: Date;
    contaWhatsAppOrigemId: string;
    conversaId: string;
    encerradoEm: Date | null;
    encerradoPorId: string | null;
    encerradoPorTipo: 'FLUXO' | 'USUARIO' | null;
    estado: 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO' | 'ENCERRADO_REABRIVEL';
    filaAtualId: string | null;
    filaFallbackReaberturaId: string | null;
    finalizadoDefinitivamenteEm: Date | null;
    id: string;
    iniciadoEm: Date;
    modo: 'BOT' | 'FILA_HUMANA' | 'HUMANO';
    motivoEncerramento: string | null;
    motivoEspera:
      | 'AGUARDANDO_CLIENTE'
      | 'AGUARDANDO_HUMANO'
      | 'FORA_DO_HORARIO'
      | 'NENHUM'
      | 'PROCESSANDO_BOT';
    podeReabrirAte: Date | null;
    protocoloErp: { protocoloOficial: string | null } | null;
    usuarioResponsavelId: string | null;
    versaoAtribuicao: number;
    versaoEstado: number;
  }): ContextoAtendimentoErpPersistido {
    const protocoloOficial = atendimento.protocoloErp?.protocoloOficial;
    if (protocoloOficial === null || protocoloOficial === undefined) {
      throw new Error('PROTOCOLO_OFICIAL_INCONSISTENTE');
    }
    return {
      atendimento: {
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
          : {
              filaFallbackReaberturaId:
                atendimento.filaFallbackReaberturaId,
            }),
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
      },
      protocoloOficial,
    };
  }
}
