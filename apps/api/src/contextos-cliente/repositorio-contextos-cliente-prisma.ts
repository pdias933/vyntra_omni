import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  AlvoContextoAtendimento,
  ContextoAtendimentoPersistido,
} from './modelo-contexto-cliente.js';
import type { RepositorioContextosCliente } from './repositorio-contextos-cliente.js';

@Injectable()
export class RepositorioContextosClientePrisma
  implements RepositorioContextosCliente
{
  public async obterContatoDoAtendimento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<string | undefined> {
    const atendimento = await transacao.atendimento.findUnique({
      select: { conversa: { select: { contatoId: true } } },
      where: { id: atendimentoId },
    });
    return atendimento?.conversa.contatoId;
  }

  public async obterAlvoAtivo(
    contatoId: string,
    vinculoClienteId: string,
    vinculoContratoId: string | undefined,
    transacao: TransacaoPrisma,
  ): Promise<AlvoContextoAtendimento | undefined> {
    const vinculo = await transacao.vinculoCliente.findFirst({
      select: { clienteExternoId: true, contatoId: true, id: true },
      where: { contatoId, id: vinculoClienteId, revogadoEm: null },
    });
    if (vinculo === null) return undefined;
    if (vinculoContratoId === undefined) {
      return {
        clienteExternoId: vinculo.clienteExternoId,
        contatoId: vinculo.contatoId,
        vinculoClienteId: vinculo.id,
      };
    }
    const contrato = await transacao.vinculoContrato.findFirst({
      select: { contratoExternoId: true, id: true },
      where: {
        id: vinculoContratoId,
        revogadoEm: null,
        vinculoClienteId: vinculo.id,
      },
    });
    if (contrato === null) return undefined;
    return {
      clienteExternoId: vinculo.clienteExternoId,
      contatoId: vinculo.contatoId,
      contratoExternoId: contrato.contratoExternoId,
      vinculoClienteId: vinculo.id,
      vinculoContratoId: contrato.id,
    };
  }

  public async obterAlvoAutomatizavel(
    contatoId: string,
    vinculoClienteId: string,
    vinculoContratoId: string | undefined,
    transacao: TransacaoPrisma,
  ): Promise<AlvoContextoAtendimento | undefined> {
    const vinculo = await transacao.vinculoCliente.findFirst({
      select: { clienteExternoId: true, contatoId: true, id: true },
      where: {
        contatoId,
        id: vinculoClienteId,
        revogadoEm: null,
        verificadoEm: { not: null },
        OR: [
          { tipo: 'VERIFICADO' },
          { tipo: 'MANUAL', verificadoPorUsuarioId: { not: null } },
        ],
      },
    });
    if (vinculo === null) return undefined;
    if (vinculoContratoId === undefined) {
      return {
        clienteExternoId: vinculo.clienteExternoId,
        contatoId: vinculo.contatoId,
        vinculoClienteId: vinculo.id,
      };
    }
    const contrato = await transacao.vinculoContrato.findFirst({
      select: { contratoExternoId: true, id: true },
      where: {
        id: vinculoContratoId,
        revogadoEm: null,
        vinculoClienteId: vinculo.id,
      },
    });
    if (contrato === null) return undefined;
    return {
      clienteExternoId: vinculo.clienteExternoId,
      contatoId: vinculo.contatoId,
      contratoExternoId: contrato.contratoExternoId,
      vinculoClienteId: vinculo.id,
      vinculoContratoId: contrato.id,
    };
  }

  public async obterContexto(
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoPersistido | undefined> {
    const contexto = await transacao.contextoAtendimento.findUnique({
      where: { atendimentoId },
    });
    if (contexto === null) return undefined;
    return this.mapear(contexto);
  }

  public async criar(
    contexto: ContextoAtendimentoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const existente = await transacao.contextoAtendimento.findUnique({
      select: { atendimentoId: true },
      where: { atendimentoId: contexto.atendimentoId },
    });
    if (existente !== null) return false;
    await transacao.contextoAtendimento.create({
      data: this.dados(contexto),
    });
    return true;
  }

  public async alterar(
    contexto: ContextoAtendimentoPersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.contextoAtendimento.updateMany({
      data: this.dados(contexto),
      where: {
        atendimentoId: contexto.atendimentoId,
        contatoId: contexto.contatoId,
        versao: versaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  private dados(contexto: ContextoAtendimentoPersistido) {
    return {
      alteradoEm: contexto.alteradoEm,
      alteradoPorUsuarioId: contexto.alteradoPorUsuarioId ?? null,
      atendimentoId: contexto.atendimentoId,
      clienteExternoAtivoId: contexto.clienteExternoId,
      contatoId: contexto.contatoId,
      contratoExternoAtivoId: contexto.contratoExternoId ?? null,
      origem: contexto.origem,
      versao: contexto.versao,
      vinculoClienteId: contexto.vinculoClienteId,
      vinculoContratoId: contexto.vinculoContratoId ?? null,
    };
  }

  private mapear(contexto: {
    readonly alteradoEm: Date;
    readonly alteradoPorUsuarioId: string | null;
    readonly atendimentoId: string;
    readonly clienteExternoAtivoId: string;
    readonly contatoId: string;
    readonly contratoExternoAtivoId: string | null;
    readonly origem: 'IDENTIFICACAO' | 'USUARIO' | 'FLUXO' | 'SISTEMA';
    readonly versao: number;
    readonly vinculoClienteId: string;
    readonly vinculoContratoId: string | null;
  }): ContextoAtendimentoPersistido {
    return {
      alteradoEm: contexto.alteradoEm,
      atendimentoId: contexto.atendimentoId,
      clienteExternoId: contexto.clienteExternoAtivoId,
      contatoId: contexto.contatoId,
      origem: contexto.origem,
      versao: contexto.versao,
      vinculoClienteId: contexto.vinculoClienteId,
      ...(contexto.alteradoPorUsuarioId === null
        ? {}
        : { alteradoPorUsuarioId: contexto.alteradoPorUsuarioId }),
      ...(contexto.contratoExternoAtivoId === null
        ? {}
        : { contratoExternoId: contexto.contratoExternoAtivoId }),
      ...(contexto.vinculoContratoId === null
        ? {}
        : { vinculoContratoId: contexto.vinculoContratoId }),
    };
  }
}
