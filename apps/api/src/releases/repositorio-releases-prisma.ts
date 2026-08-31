import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { PlataformaMobile } from '../autenticacao/modelo-autenticacao-mobile.js';
import type {
  ContextoControlesRecursoUsuario,
  ControleRecursoPersistido,
  EstadoControleRecurso,
  PoliticaVersaoMobilePersistida,
} from './modelo-releases.js';
import type { RepositorioReleases } from './repositorio-releases.js';

@Injectable()
export class RepositorioReleasesPrisma implements RepositorioReleases {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async listarControles(
    transacao?: TransacaoPrisma,
  ): Promise<readonly ControleRecursoPersistido[]> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const controles = await cliente.controleRecurso.findMany({
      orderBy: { codigo: 'asc' },
      select: this.selecaoControle(),
    });
    return controles.map((controle) => this.mapearControle(controle));
  }

  public async obterContextoControlesUsuario(
    usuarioId: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContextoControlesRecursoUsuario | undefined> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const usuario = await cliente.usuario.findUnique({
      select: {
        estado: true,
        perfil: { select: { estado: true, papelBase: true } },
      },
      where: { id: usuarioId },
    });
    if (usuario === null) return undefined;
    const controles = await cliente.controleRecurso.findMany({
      orderBy: { codigo: 'asc' },
      select: {
        ...this.selecaoControle(),
        filas: {
          select: { filaId: true },
          where: {
            fila: {
              acessosUsuarios: {
                some: { estado: 'ATIVO', usuarioId },
              },
              estado: 'ATIVA',
            },
          },
        },
        usuarios: {
          select: { usuarioId: true },
          where: { usuarioId },
        },
      },
    });
    return {
      controles: controles.map((controle) => ({
        ...this.mapearControle(controle),
        filaAlvo: controle.filas.length > 0,
        usuarioAlvo: controle.usuarios.length > 0,
      })),
      papelBase: usuario.perfil?.papelBase,
      perfilAtivo: usuario.perfil?.estado === 'ATIVO',
      usuarioAtivo: usuario.estado === 'ATIVO',
    };
  }

  public async obterControle(
    codigo: string,
    transacao: TransacaoPrisma,
  ): Promise<ControleRecursoPersistido | undefined> {
    const controle = await transacao.controleRecurso.findUnique({
      select: this.selecaoControle(),
      where: { codigo },
    });
    return controle === null ? undefined : this.mapearControle(controle);
  }

  public async serializarControle(
    codigo: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$queryRaw(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${`CONTROLE_RECURSO:${codigo}`}, 0)) AS text) AS bloqueio`,
    );
  }

  public async alvosAtivosExistem(
    usuarios: readonly string[],
    filas: readonly string[],
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const quantidadeUsuarios = await transacao.usuario.count({
      where: { estado: 'ATIVO', id: { in: [...usuarios] } },
    });
    const quantidadeFilas = await transacao.fila.count({
      where: { estado: 'ATIVA', id: { in: [...filas] } },
    });
    return (
      quantidadeUsuarios === usuarios.length && quantidadeFilas === filas.length
    );
  }

  public async criarControle(
    entrada: {
      readonly id: string;
      readonly codigo: string;
      readonly estado: EstadoControleRecurso;
      readonly desligadoEmergencialmente: boolean;
      readonly liberarAdministradores: boolean;
      readonly percentualLiberacao: number;
      readonly usuariosAlvo: readonly string[];
      readonly filasAlvo: readonly string[];
    },
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.controleRecurso.create({
      data: {
        codigo: entrada.codigo,
        desligadoEmergencialmente: entrada.desligadoEmergencialmente,
        estado: entrada.estado,
        filas: {
          create: entrada.filasAlvo.map((filaId) => ({ filaId })),
        },
        id: entrada.id,
        liberarAdministradores: entrada.liberarAdministradores,
        percentualLiberacao: entrada.percentualLiberacao,
        usuarios: {
          create: entrada.usuariosAlvo.map((usuarioId) => ({ usuarioId })),
        },
        versao: 1,
      },
    });
  }

  public async atualizarControle(
    entrada: {
      readonly id: string;
      readonly versaoEsperada: number;
      readonly estado: EstadoControleRecurso;
      readonly desligadoEmergencialmente: boolean;
      readonly liberarAdministradores: boolean;
      readonly percentualLiberacao: number;
      readonly usuariosAlvo: readonly string[];
      readonly filasAlvo: readonly string[];
    },
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const alterado = await transacao.controleRecurso.updateMany({
      data: {
        desligadoEmergencialmente: entrada.desligadoEmergencialmente,
        estado: entrada.estado,
        liberarAdministradores: entrada.liberarAdministradores,
        percentualLiberacao: entrada.percentualLiberacao,
        versao: { increment: 1 },
      },
      where: { id: entrada.id, versao: entrada.versaoEsperada },
    });
    if (alterado.count !== 1) return false;
    await transacao.liberacaoControleRecursoUsuario.deleteMany({
      where: { controleRecursoId: entrada.id },
    });
    await transacao.liberacaoControleRecursoFila.deleteMany({
      where: { controleRecursoId: entrada.id },
    });
    if (entrada.usuariosAlvo.length > 0) {
      await transacao.liberacaoControleRecursoUsuario.createMany({
        data: entrada.usuariosAlvo.map((usuarioId) => ({
          controleRecursoId: entrada.id,
          usuarioId,
        })),
      });
    }
    if (entrada.filasAlvo.length > 0) {
      await transacao.liberacaoControleRecursoFila.createMany({
        data: entrada.filasAlvo.map((filaId) => ({
          controleRecursoId: entrada.id,
          filaId,
        })),
      });
    }
    return true;
  }

  public async listarPoliticas(
    transacao?: TransacaoPrisma,
  ): Promise<readonly PoliticaVersaoMobilePersistida[]> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const politicas = await cliente.politicaVersaoMobile.findMany({
      orderBy: { plataforma: 'asc' },
    });
    return politicas.map((politica) => this.mapearPolitica(politica));
  }

  public async obterPolitica(
    plataforma: PlataformaMobile,
    transacao?: TransacaoPrisma,
  ): Promise<PoliticaVersaoMobilePersistida | undefined> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const politica = await cliente.politicaVersaoMobile.findUnique({
      where: { plataforma },
    });
    return politica === null ? undefined : this.mapearPolitica(politica);
  }

  public async serializarPolitica(
    plataforma: PlataformaMobile,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$queryRaw(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${`POLITICA_VERSAO_MOBILE:${plataforma}`}, 0)) AS text) AS bloqueio`,
    );
  }

  public async atualizarPolitica(
    entrada: {
      readonly plataforma: PlataformaMobile;
      readonly versaoEsperada: number;
      readonly versaoMinima: string;
      readonly versaoRecomendada: string;
      readonly mensagem?: string;
      readonly urlLoja?: string;
    },
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.politicaVersaoMobile.updateMany({
      data: {
        mensagem: entrada.mensagem ?? null,
        urlLoja: entrada.urlLoja ?? null,
        versao: { increment: 1 },
        versaoMinima: entrada.versaoMinima,
        versaoRecomendada: entrada.versaoRecomendada,
      },
      where: {
        plataforma: entrada.plataforma,
        versao: entrada.versaoEsperada,
      },
    });
    return resultado.count === 1;
  }

  private selecaoControle() {
    return {
      codigo: true,
      desligadoEmergencialmente: true,
      estado: true,
      filas: { orderBy: { filaId: 'asc' as const }, select: { filaId: true } },
      id: true,
      liberarAdministradores: true,
      percentualLiberacao: true,
      usuarios: {
        orderBy: { usuarioId: 'asc' as const },
        select: { usuarioId: true },
      },
      versao: true,
    } as const;
  }

  private mapearControle(controle: {
    readonly id: string;
    readonly codigo: string;
    readonly estado: EstadoControleRecurso;
    readonly desligadoEmergencialmente: boolean;
    readonly liberarAdministradores: boolean;
    readonly percentualLiberacao: number;
    readonly versao: number;
    readonly usuarios: readonly { readonly usuarioId: string }[];
    readonly filas: readonly { readonly filaId: string }[];
  }): ControleRecursoPersistido {
    return {
      codigo: controle.codigo,
      desligadoEmergencialmente: controle.desligadoEmergencialmente,
      estado: controle.estado,
      filasAlvo: controle.filas.map(({ filaId }) => filaId),
      id: controle.id,
      liberarAdministradores: controle.liberarAdministradores,
      percentualLiberacao: controle.percentualLiberacao,
      usuariosAlvo: controle.usuarios.map(({ usuarioId }) => usuarioId),
      versao: controle.versao,
    };
  }

  private mapearPolitica(politica: {
    readonly plataforma: PlataformaMobile;
    readonly versaoMinima: string;
    readonly versaoRecomendada: string;
    readonly mensagem: string | null;
    readonly urlLoja: string | null;
    readonly versao: number;
  }): PoliticaVersaoMobilePersistida {
    return {
      plataforma: politica.plataforma,
      versao: politica.versao,
      versaoMinima: politica.versaoMinima,
      versaoRecomendada: politica.versaoRecomendada,
      ...(politica.mensagem === null ? {} : { mensagem: politica.mensagem }),
      ...(politica.urlLoja === null ? {} : { urlLoja: politica.urlLoja }),
    };
  }
}
