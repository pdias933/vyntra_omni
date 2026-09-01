import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContatoPersistido,
  EntradaAlteracaoIdentidadeWhatsApp,
  IdentidadeWhatsAppPersistida,
  ResultadoAlteracaoIdentidadeWhatsApp,
} from './modelo-contato.js';
import type { RepositorioContatos } from './repositorio-contatos.js';

@Injectable()
export class RepositorioContatosPrisma implements RepositorioContatos {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async bloquearIdentidade(
    portfolioEmpresarialExternoId: string,
    identificadorExternoEstavel: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const chave = `${portfolioEmpresarialExternoId}\u0000${identificadorExternoEstavel}`;
    await transacao.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`,
    );
  }

  public async obterPorIdentificadorEstavel(
    portfolioEmpresarialExternoId: string,
    identificadorExternoEstavel: string,
    transacao: TransacaoPrisma,
  ): Promise<
    | {
        readonly contato: ContatoPersistido;
        readonly identidade: IdentidadeWhatsAppPersistida;
      }
    | undefined
  > {
    const identidadeAtual = await transacao.identidadeWhatsApp.findUnique({
      include: { contato: true },
      where: {
        portfolioEmpresarialExternoId_identificadorExternoEstavel: {
          identificadorExternoEstavel,
          portfolioEmpresarialExternoId,
        },
      },
    });
    if (identidadeAtual !== null) return this.mapearAgregado(identidadeAtual);

    const alias = await transacao.aliasIdentidadeWhatsApp.findUnique({
      include: { identidadeWhatsApp: { include: { contato: true } } },
      where: {
        portfolioEmpresarialExternoId_identificadorExternoAnterior: {
          identificadorExternoAnterior: identificadorExternoEstavel,
          portfolioEmpresarialExternoId,
        },
      },
    });
    if (alias === null) return undefined;
    return this.mapearAgregado(alias.identidadeWhatsApp);
  }

  public async alterarIdentificadorConfirmado(
    identidade: IdentidadeWhatsAppPersistida,
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
    portfolioEmpresarialExternoId: string,
    eventoId: string,
    observadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const alteracao = await transacao.identidadeWhatsApp.updateMany({
      data: {
        atualizadaEm: observadoEm,
        contaWhatsAppUltimaObservacaoId: entrada.contaWhatsAppId,
        identificadorExternoEstavel: entrada.identificadorExternoAtual,
        ...(entrada.nomePerfilAtual === undefined
          ? {}
          : { nomePerfil: entrada.nomePerfilAtual }),
        ...(entrada.nomeUsuarioAtual === undefined
          ? {}
          : { nomeUsuario: entrada.nomeUsuarioAtual }),
        ...(entrada.telefoneE164Atual === undefined
          ? {}
          : { telefoneE164: entrada.telefoneE164Atual }),
      },
      where: {
        id: identidade.id,
        identificadorExternoEstavel: entrada.identificadorExternoAnterior,
        portfolioEmpresarialExternoId,
      },
    });
    if (alteracao.count !== 1) throw new Error('CONFLITO_ALTERACAO_IDENTIDADE');
    await transacao.aliasIdentidadeWhatsApp.create({
      data: {
        id: randomUUID(),
        identificadorExternoAnterior: entrada.identificadorExternoAnterior,
        identidadeWhatsAppId: identidade.id,
        portfolioEmpresarialExternoId,
        substituidoEm: observadoEm,
      },
    });
    await transacao.eventoAlteracaoIdentidadeWhatsApp.create({
      data: {
        contaWhatsAppObservacaoId: entrada.contaWhatsAppId,
        id: eventoId,
        identificadorExternoAnterior: entrada.identificadorExternoAnterior,
        identificadorExternoAtual: entrada.identificadorExternoAtual,
        identidadeWhatsAppId: identidade.id,
        observadoEm,
        portfolioEmpresarialExternoId,
        resultado: 'PRESERVADA',
      },
    });
  }

  public async registrarEventoAlteracao(
    identidadeWhatsAppId: string,
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
    portfolioEmpresarialExternoId: string,
    resultado: ResultadoAlteracaoIdentidadeWhatsApp,
    eventoId: string,
    observadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const existente = await transacao.eventoAlteracaoIdentidadeWhatsApp.findUnique({
      where: {
        portfolioEmpresarialExternoId_identificadorExternoAnterior_identificadorExternoAtual:
          {
            identificadorExternoAnterior: entrada.identificadorExternoAnterior,
            identificadorExternoAtual: entrada.identificadorExternoAtual,
            portfolioEmpresarialExternoId,
          },
      },
    });
    if (existente !== null) return false;
    await transacao.eventoAlteracaoIdentidadeWhatsApp.create({
      data: {
        contaWhatsAppObservacaoId: entrada.contaWhatsAppId,
        id: eventoId,
        identificadorExternoAnterior: entrada.identificadorExternoAnterior,
        identificadorExternoAtual: entrada.identificadorExternoAtual,
        identidadeWhatsAppId,
        observadoEm,
        portfolioEmpresarialExternoId,
        resultado,
      },
    });
    return true;
  }

  private mapearAgregado(identidade: {
    readonly atualizadaEm: Date;
    readonly contaWhatsAppUltimaObservacaoId: string;
    readonly contatoId: string;
    readonly criadaEm: Date;
    readonly id: string;
    readonly identificadorExternoEstavel: string;
    readonly nomePerfil: string | null;
    readonly nomeUsuario: string | null;
    readonly portfolioEmpresarialExternoId: string;
    readonly telefoneE164: string | null;
    readonly contato: {
      readonly atualizadoEm: Date;
      readonly criadoEm: Date;
      readonly estado: 'NORMAL' | 'BLOQUEADO';
      readonly id: string;
      readonly nomeExibicao: string | null;
      readonly ultimaInteracaoEm: Date | null;
    };
  }): {
    readonly contato: ContatoPersistido;
    readonly identidade: IdentidadeWhatsAppPersistida;
  } {
    return {
      contato: {
        atualizadoEm: identidade.contato.atualizadoEm,
        criadoEm: identidade.contato.criadoEm,
        estado: identidade.contato.estado,
        id: identidade.contato.id,
        ...(identidade.contato.nomeExibicao === null
          ? {}
          : { nomeExibicao: identidade.contato.nomeExibicao }),
        ...(identidade.contato.ultimaInteracaoEm === null
          ? {}
          : { ultimaInteracaoEm: identidade.contato.ultimaInteracaoEm }),
      },
      identidade: this.mapearIdentidade(identidade),
    };
  }

  public async criar(
    contato: ContatoPersistido,
    identidade: IdentidadeWhatsAppPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.contato.create({
      data: {
        atualizadoEm: contato.atualizadoEm,
        criadoEm: contato.criadoEm,
        estado: contato.estado,
        id: contato.id,
        nomeExibicao: contato.nomeExibicao ?? null,
        ultimaInteracaoEm: contato.ultimaInteracaoEm ?? null,
      },
    });
    await transacao.identidadeWhatsApp.create({
      data: {
        atualizadaEm: identidade.atualizadaEm,
        contaWhatsAppUltimaObservacaoId:
          identidade.contaWhatsAppUltimaObservacaoId,
        contatoId: identidade.contatoId,
        criadaEm: identidade.criadaEm,
        id: identidade.id,
        identificadorExternoEstavel:
          identidade.identificadorExternoEstavel,
        nomePerfil: identidade.nomePerfil ?? null,
        nomeUsuario: identidade.nomeUsuario ?? null,
        portfolioEmpresarialExternoId:
          identidade.portfolioEmpresarialExternoId,
        telefoneE164: identidade.telefoneE164 ?? null,
      },
    });
  }

  private mapearIdentidade(identidade: {
    readonly atualizadaEm: Date;
    readonly contaWhatsAppUltimaObservacaoId: string;
    readonly contatoId: string;
    readonly criadaEm: Date;
    readonly id: string;
    readonly identificadorExternoEstavel: string;
    readonly nomePerfil: string | null;
    readonly nomeUsuario: string | null;
    readonly portfolioEmpresarialExternoId: string;
    readonly telefoneE164: string | null;
  }): IdentidadeWhatsAppPersistida {
    return {
      atualizadaEm: identidade.atualizadaEm,
      contaWhatsAppUltimaObservacaoId:
        identidade.contaWhatsAppUltimaObservacaoId,
      contatoId: identidade.contatoId,
      criadaEm: identidade.criadaEm,
      id: identidade.id,
      identificadorExternoEstavel: identidade.identificadorExternoEstavel,
      portfolioEmpresarialExternoId:
        identidade.portfolioEmpresarialExternoId,
      ...(identidade.nomePerfil === null
        ? {}
        : { nomePerfil: identidade.nomePerfil }),
      ...(identidade.nomeUsuario === null
        ? {}
        : { nomeUsuario: identidade.nomeUsuario }),
      ...(identidade.telefoneE164 === null
        ? {}
        : { telefoneE164: identidade.telefoneE164 }),
    };
  }
}
