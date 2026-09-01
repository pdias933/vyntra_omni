import { Injectable } from '@nestjs/common';

import type { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSaidaMensagemAutomatica,
  ContextoSaidaMensagem,
  MensagemAutomaticaParaDespacho,
  MensagemSaidaPersistida,
} from './modelo-mensagem.js';
import type { RepositorioMensagens } from './repositorio-mensagens.js';

@Injectable()
export class RepositorioMensagensPrisma implements RepositorioMensagens {
  public async bloquearAutoridadeSaida(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`autoridade-saida:${atendimentoId}`}, 0))`;
  }

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

  public async obterContextoSaidaAutomatica(
    execucaoFluxoId: string,
    atendimentoId: string,
    revisaoExecucao: number,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSaidaMensagemAutomatica | undefined> {
    const execucao = await transacao.execucaoFluxo.findFirst({
      select: {
        atendimento: {
          select: {
            contaWhatsAppOrigemId: true,
            conversa: { select: { contatoId: true } },
            conversaId: true,
            versaoAtribuicao: true,
          },
        },
      },
      where: {
        atendimento: {
          contaWhatsAppOrigem: { estado: 'ATIVA' },
          conversa: { contato: { estado: 'NORMAL' } },
          estado: 'AGUARDANDO',
          modo: 'BOT',
          motivoEspera: 'PROCESSANDO_BOT',
          usuarioResponsavelId: null,
        },
        atendimentoId,
        estado: 'EXECUTANDO',
        id: execucaoFluxoId,
        revisao: revisaoExecucao,
      },
    });
    if (execucao === null) return undefined;
    return {
      contaWhatsAppId: execucao.atendimento.contaWhatsAppOrigemId,
      contatoId: execucao.atendimento.conversa.contatoId,
      conversaId: execucao.atendimento.conversaId,
      versaoAtribuicao: execucao.atendimento.versaoAtribuicao,
    };
  }

  public async modeloAprovado(
    modeloId: string,
    contaWhatsAppId: string,
    quantidadeParametros: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    return await transacao.modeloMensagemCanal.count({
      where: {
        contaWhatsAppId,
        estado: 'APROVADO',
        id: modeloId,
        quantidadeParametros,
      },
    }) === 1;
  }

  public async obterAutomaticaParaDespacho(
    mensagemId: string,
    transacao: TransacaoPrisma,
  ): Promise<MensagemAutomaticaParaDespacho | undefined> {
    const registro = await transacao.mensagem.findUnique({
      include: {
        atendimento: {
          select: {
            estado: true,
            modo: true,
            motivoEspera: true,
            usuarioResponsavelId: true,
            versaoAtribuicao: true,
          },
        },
        execucaoFluxoOrigem: {
          select: { atendimentoId: true, estado: true },
        },
      },
      where: { id: mensagemId },
    });
    if (
      registro === null ||
      registro.execucaoFluxoOrigemId === null ||
      registro.versaoAtribuicaoOrigem === null ||
      registro.direcao !== 'SAIDA' ||
      registro.usuarioRemetenteId !== null
    ) {
      return undefined;
    }
    const { atendimento, execucaoFluxoOrigem, ...mensagem } = registro;
    const autoridadeValida =
      atendimento.estado === 'AGUARDANDO' &&
      atendimento.modo === 'BOT' &&
      atendimento.motivoEspera === 'PROCESSANDO_BOT' &&
      atendimento.usuarioResponsavelId === null &&
      atendimento.versaoAtribuicao === registro.versaoAtribuicaoOrigem &&
      execucaoFluxoOrigem?.atendimentoId === registro.atendimentoId &&
      !['CANCELADA', 'FALHOU', 'SUSPENSA_POR_ATENDIMENTO_HUMANO'].includes(
        execucaoFluxoOrigem.estado,
      );
    return {
      autoridadeValida,
      mensagem: mensagem as unknown as MensagemSaidaPersistida,
    };
  }

  public async atualizarAutomaticaCondicional(
    mensagem: MensagemSaidaPersistida,
    estadoEsperado: MensagemSaidaPersistida['estadoSaida'],
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.mensagem.updateMany({
      data: {
        canceladaEm: mensagem.canceladaEm ?? null,
        codigoFalha: mensagem.codigoFalha ?? null,
        enviadaEm: mensagem.enviadaEm ?? null,
        estadoSaida: mensagem.estadoSaida,
        falhouEm: mensagem.falhouEm ?? null,
        identificadorExternoMensagem:
          mensagem.identificadorExternoMensagem ?? null,
        proximaTentativaEm: mensagem.proximaTentativaEm ?? null,
        tentativasEnvio: mensagem.tentativasEnvio,
        versao: mensagem.versao,
      },
      where: {
        estadoSaida: estadoEsperado,
        execucaoFluxoOrigemId: { not: null },
        id: mensagem.id,
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
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
