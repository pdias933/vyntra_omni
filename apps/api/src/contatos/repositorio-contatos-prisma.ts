import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContatoPersistido,
  IdentidadeWhatsAppPersistida,
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
    const identidade = await transacao.identidadeWhatsApp.findUnique({
      include: { contato: true },
      where: {
        portfolioEmpresarialExternoId_identificadorExternoEstavel: {
          identificadorExternoEstavel,
          portfolioEmpresarialExternoId,
        },
      },
    });
    if (identidade === null) return undefined;
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
