import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  CredencialLoginMobile,
  DispositivoMobilePersistido,
  EntradaDispositivoMobile,
  RegistroTentativaLoginMobile,
  SessaoMobilePersistida,
} from './modelo-autenticacao-mobile.js';
import type { RepositorioAutenticacaoMobile } from './repositorio-autenticacao-mobile.js';

@Injectable()
export class RepositorioAutenticacaoMobilePrisma
  implements RepositorioAutenticacaoMobile
{
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async obterCredencial(
    identificadorNormalizado: string,
  ): Promise<CredencialLoginMobile | undefined> {
    const cliente = await this.prisma.obterCliente();
    const credencial = await cliente.credencialSenha.findUnique({
      select: {
        estado: true,
        senhaHash: true,
        usuario: {
          select: {
            estado: true,
            id: true,
            nomeExibicao: true,
            perfil: {
              select: {
                estado: true,
                papelBase: true,
                permissoes: { select: { codigo: true, efeito: true } },
              },
            },
          },
        },
      },
      where: { identificadorNormalizado },
    });
    if (credencial === null) return undefined;
    return {
      ajustes:
        credencial.usuario.perfil?.permissoes.map(({ codigo, efeito }) => ({
          codigo,
          efeito,
        })) ?? [],
      credencialAtiva: credencial.estado === 'ATIVA',
      nomeExibicao: credencial.usuario.nomeExibicao,
      papelBase: credencial.usuario.perfil?.papelBase,
      perfilAtivo: credencial.usuario.perfil?.estado === 'ATIVO',
      senhaHash: credencial.senhaHash,
      usuarioAtivo: credencial.usuario.estado === 'ATIVO',
      usuarioId: credencial.usuario.id,
    };
  }

  public async serializarLimiteLogin(
    identificadorHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const chaves = [
      `LOGIN_MOBILE_CONTA_IP_DISPOSITIVO:${identificadorHash}:${enderecoIp}:${identificadorInstalacaoHash}`,
      `LOGIN_MOBILE_IP:${enderecoIp}`,
    ].sort();
    for (const chave of chaves) {
      await transacao.$queryRaw(
        Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${chave}, 0)) AS text) AS bloqueio`,
      );
    }
  }

  public async contarFalhasRecentes(
    identificadorHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly contaIpDispositivo: number; readonly ip: number }> {
    const contaIpDispositivo = await transacao.tentativaLoginMobile.count({
      where: {
        criadoEm: { gte: desde },
        enderecoIp,
        identificadorHash,
        identificadorInstalacaoHash,
        resultado: { in: ['FALHA', 'BLOQUEADA'] },
      },
    });
    const ip = await transacao.tentativaLoginMobile.count({
      where: {
        criadoEm: { gte: desde },
        enderecoIp,
        resultado: { in: ['FALHA', 'BLOQUEADA'] },
      },
    });
    return { contaIpDispositivo, ip };
  }

  public async registrarTentativa(
    tentativa: RegistroTentativaLoginMobile,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.tentativaLoginMobile.create({ data: tentativa });
  }

  public async atualizarResultadoTentativa(
    tentativaId: string,
    resultado: 'FALHA' | 'SUCESSO',
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const atualizado = await transacao.tentativaLoginMobile.updateMany({
      data: { resultado },
      where: { id: tentativaId, resultado: 'FALHA' },
    });
    return atualizado.count === 1;
  }

  public async serializarDispositivo(
    usuarioId: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const chave = `DISPOSITIVO_MOBILE:${usuarioId}:${identificadorInstalacaoHash}`;
    await transacao.$queryRaw(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${chave}, 0)) AS text) AS bloqueio`,
    );
  }

  public async obterDispositivo(
    usuarioId: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<DispositivoMobilePersistido | undefined> {
    const dispositivo = await transacao.dispositivoMobile.findUnique({
      select: { estado: true, id: true, segredoVinculoHash: true, usuarioId: true },
      where: {
        usuarioId_identificadorInstalacaoHash: {
          identificadorInstalacaoHash,
          usuarioId,
        },
      },
    });
    return dispositivo === null ? undefined : dispositivo;
  }

  public async criarDispositivo(
    dispositivo: EntradaDispositivoMobile & {
      readonly id: string;
      readonly usuarioId: string;
      readonly agora: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.dispositivoMobile.create({
      data: {
        id: dispositivo.id,
        identificadorInstalacaoHash: dispositivo.identificadorInstalacaoHash,
        modeloSanitizado: dispositivo.modeloSanitizado ?? null,
        plataforma: dispositivo.plataforma,
        segredoVinculoHash: dispositivo.segredoVinculoHash,
        ultimoAcessoEm: dispositivo.agora,
        usuarioId: dispositivo.usuarioId,
        versaoAplicativo: dispositivo.versaoAplicativo,
      },
    });
  }

  public async atualizarDispositivo(
    dispositivoId: string,
    entrada: EntradaDispositivoMobile,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.dispositivoMobile.updateMany({
      data: {
        modeloSanitizado: entrada.modeloSanitizado ?? null,
        plataforma: entrada.plataforma,
        ultimoAcessoEm: agora,
        versaoAplicativo: entrada.versaoAplicativo,
      },
      where: { estado: 'ATIVO', id: dispositivoId },
    });
    return resultado.count === 1;
  }

  public async revogarSessoesAtivasDispositivo(
    dispositivoId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    const resultado = await transacao.sessaoMobile.updateMany({
      data: { estado: 'REVOGADA', motivoRevogacao: motivo, revogadaEm: agora },
      where: { dispositivoId, estado: 'ATIVA' },
    });
    return resultado.count;
  }

  public async criarSessao(
    sessao: {
      readonly id: string;
      readonly usuarioId: string;
      readonly dispositivoId: string;
      readonly tokenAcessoHash: string;
      readonly tokenRefreshHash: string;
      readonly autenticadaEm: Date;
      readonly acessoExpiraEm: Date;
      readonly refreshExpiraEm: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.sessaoMobile.create({ data: sessao });
  }

  public async obterSessaoPorAcesso(
    tokenAcessoHash: string,
    transacao?: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined> {
    const contexto = transacao ?? (await this.prisma.obterCliente());
    const sessao = await contexto.sessaoMobile.findUnique({
      select: this.selecaoSessao(),
      where: { tokenAcessoHash },
    });
    return sessao === null ? undefined : this.mapearSessao(sessao);
  }

  public async serializarTokenRefresh(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.$queryRaw(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${`TOKEN_REFRESH_MOBILE:${tokenRefreshHash}`}, 0)) AS text) AS bloqueio`,
    );
  }

  public async obterSessaoPorRefreshAtual(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined> {
    const sessao = await transacao.sessaoMobile.findUnique({
      select: this.selecaoSessao(),
      where: { tokenRefreshHash },
    });
    return sessao === null ? undefined : this.mapearSessao(sessao);
  }

  public async obterSessaoPorRefreshUsado(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined> {
    const usado = await transacao.tokenRefreshMobileUsado.findUnique({
      select: { sessao: { select: this.selecaoSessao() } },
      where: { tokenHash: tokenRefreshHash },
    });
    return usado === null ? undefined : this.mapearSessao(usado.sessao);
  }

  public async rotacionarSessao(
    sessaoId: string,
    tokenRefreshHashAtual: string,
    tokenAcessoHashNovo: string,
    tokenRefreshHashNovo: string,
    acessoExpiraEm: Date,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    await transacao.tokenRefreshMobileUsado.create({
      data: { sessaoId, tokenHash: tokenRefreshHashAtual, usadoEm: agora },
    });
    const resultado = await transacao.sessaoMobile.updateMany({
      data: {
        acessoExpiraEm,
        rotacionadaEm: agora,
        tokenAcessoHash: tokenAcessoHashNovo,
        tokenRefreshHash: tokenRefreshHashNovo,
        versao: { increment: 1 },
      },
      where: {
        estado: 'ATIVA',
        id: sessaoId,
        refreshExpiraEm: { gt: agora },
        tokenRefreshHash: tokenRefreshHashAtual,
      },
    });
    return resultado.count === 1;
  }

  public async revogarSessao(
    sessaoId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.sessaoMobile.updateMany({
      data: { estado: 'REVOGADA', motivoRevogacao: motivo, revogadaEm: agora },
      where: { estado: 'ATIVA', id: sessaoId },
    });
    return resultado.count === 1;
  }

  private selecaoSessao() {
    return {
      acessoExpiraEm: true,
      dispositivo: { select: { estado: true, segredoVinculoHash: true } },
      dispositivoId: true,
      estado: true,
      id: true,
      refreshExpiraEm: true,
      tokenAcessoHash: true,
      tokenRefreshHash: true,
      usuario: { select: { estado: true, nomeExibicao: true } },
      usuarioId: true,
      versao: true,
    } as const;
  }

  private mapearSessao(sessao: {
    readonly acessoExpiraEm: Date;
    readonly dispositivo: { readonly estado: string; readonly segredoVinculoHash: string };
    readonly dispositivoId: string;
    readonly estado: string;
    readonly id: string;
    readonly refreshExpiraEm: Date;
    readonly tokenAcessoHash: string;
    readonly tokenRefreshHash: string;
    readonly usuario: { readonly estado: string; readonly nomeExibicao: string };
    readonly usuarioId: string;
    readonly versao: number;
  }): SessaoMobilePersistida {
    return {
      acessoExpiraEm: sessao.acessoExpiraEm,
      dispositivoAtivo: sessao.dispositivo.estado === 'ATIVO',
      dispositivoId: sessao.dispositivoId,
      estado: sessao.estado === 'ATIVA' ? 'ATIVA' : 'REVOGADA',
      id: sessao.id,
      nomeExibicao: sessao.usuario.nomeExibicao,
      refreshExpiraEm: sessao.refreshExpiraEm,
      segredoVinculoHash: sessao.dispositivo.segredoVinculoHash,
      tokenAcessoHash: sessao.tokenAcessoHash,
      tokenRefreshHash: sessao.tokenRefreshHash,
      usuarioAtivo: sessao.usuario.estado === 'ATIVO',
      usuarioId: sessao.usuarioId,
      versao: sessao.versao,
    };
  }
}
