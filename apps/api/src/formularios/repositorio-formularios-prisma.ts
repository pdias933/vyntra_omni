import { Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSubmissaoFormulario,
  SubmissaoFormularioPersistida,
} from './modelo-formulario.js';
import type { RepositorioFormularios } from './repositorio-formularios.js';

@Injectable()
export class RepositorioFormulariosPrisma implements RepositorioFormularios {
  public async bloquearSubmissao(
    mensagemId: string,
    formularioReferenciaCanal: string,
    referenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const chaves = [
      `submissao-formulario:mensagem:${mensagemId}`,
      `submissao-formulario:referencia:${formularioReferenciaCanal}:${referenciaCanal}`,
    ].sort();
    for (const chave of chaves) {
      await transacao.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`,
      );
    }
  }

  public async formularioAtivoNoAtendimento(
    formularioId: string,
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atendimento = await transacao.atendimento.findUnique({
      select: { contaWhatsAppOrigemId: true },
      where: { id: atendimentoId },
    });
    if (atendimento === null) return false;
    return (
      (await transacao.formularioCanal.findFirst({
        select: { id: true },
        where: {
          contaWhatsAppId: atendimento.contaWhatsAppOrigemId,
          estado: 'ATIVO',
          id: formularioId,
        },
      })) !== null
    );
  }

  public async obterContextoSubmissao(
    mensagemId: string,
    formularioReferenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSubmissaoFormulario | undefined> {
    const mensagem = await transacao.mensagem.findFirst({
      select: {
        atendimentoId: true,
        contatoRemetenteId: true,
        contaWhatsAppId: true,
        conversaId: true,
        recebidaServidorEm: true,
      },
      where: {
        contatoRemetenteId: { not: null },
        direcao: 'ENTRADA',
        id: mensagemId,
      },
    });
    if (mensagem?.contatoRemetenteId === null || mensagem === null) {
      return undefined;
    }
    const formulario = await transacao.formularioCanal.findFirst({
      select: { id: true },
      where: {
        contaWhatsAppId: mensagem.contaWhatsAppId,
        estado: 'ATIVO',
        referenciaCanal: formularioReferenciaCanal,
      },
    });
    if (formulario === null) return undefined;
    return {
      atendimentoId: mensagem.atendimentoId,
      contatoId: mensagem.contatoRemetenteId,
      conversaId: mensagem.conversaId,
      formularioId: formulario.id,
      recebidaEm: mensagem.recebidaServidorEm,
    };
  }

  public async obterSubmissaoPorMensagem(
    mensagemId: string,
    transacao: TransacaoPrisma,
  ): Promise<SubmissaoFormularioPersistida | undefined> {
    const submissao = await transacao.submissaoFormularioCanal.findUnique({
      include: { formulario: { select: { referenciaCanal: true } } },
      where: { mensagemId },
    });
    return submissao === null ? undefined : this.mapear(submissao);
  }

  public async obterSubmissaoPorReferencia(
    formularioId: string,
    referenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<SubmissaoFormularioPersistida | undefined> {
    const submissao = await transacao.submissaoFormularioCanal.findUnique({
      include: { formulario: { select: { referenciaCanal: true } } },
      where: {
        formularioId_referenciaCanal: { formularioId, referenciaCanal },
      },
    });
    return submissao === null ? undefined : this.mapear(submissao);
  }

  public async acrescentarSubmissao(
    submissao: SubmissaoFormularioPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.submissaoFormularioCanal.create({
      data: {
        contatoId: submissao.contatoId,
        dadosHash: submissao.dadosHash,
        dadosProtegidos: submissao.dadosProtegidos as Prisma.InputJsonValue,
        formularioId: submissao.formularioId,
        id: submissao.id,
        mensagemId: submissao.mensagemId,
        recebidaEm: submissao.recebidaEm,
        referenciaCanal: submissao.referenciaCanal,
      },
    });
  }

  private mapear(submissao: {
    readonly contatoId: string;
    readonly dadosHash: string;
    readonly dadosProtegidos: Prisma.JsonValue;
    readonly formulario: { readonly referenciaCanal: string };
    readonly formularioId: string;
    readonly id: string;
    readonly mensagemId: string;
    readonly recebidaEm: Date;
    readonly referenciaCanal: string;
  }): SubmissaoFormularioPersistida {
    return {
      contatoId: submissao.contatoId,
      dadosHash: submissao.dadosHash,
      dadosProtegidos: submissao.dadosProtegidos as SubmissaoFormularioPersistida['dadosProtegidos'],
      formularioId: submissao.formularioId,
      formularioReferenciaCanal: submissao.formulario.referenciaCanal,
      id: submissao.id,
      mensagemId: submissao.mensagemId,
      recebidaEm: submissao.recebidaEm,
      referenciaCanal: submissao.referenciaCanal,
    };
  }
}
