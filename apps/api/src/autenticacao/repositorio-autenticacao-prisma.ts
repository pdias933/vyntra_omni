import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { RepositorioAutenticacao } from './repositorio-autenticacao.js';
import type {
  CredencialLoginWeb,
  RegistroTentativaLoginWeb,
  SessaoWebPersistida,
} from './modelo-autenticacao.js';

@Injectable()
export class RepositorioAutenticacaoPrisma
  implements RepositorioAutenticacao
{
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async obterCredencial(
    identificadorNormalizado: string,
  ): Promise<CredencialLoginWeb | undefined> {
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
    if (credencial === null) {
      return undefined;
    }

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

  public async contarFalhasRecentes(
    identificadorHash: string,
    enderecoIp: string,
    desde: Date,
  ): Promise<{ readonly contaIp: number; readonly ip: number }> {
    const cliente = await this.prisma.obterCliente();
    const contaIp = await cliente.tentativaLoginWeb.count({
      where: {
        criadoEm: { gte: desde },
        enderecoIp,
        identificadorHash,
        resultado: { in: ['FALHA', 'BLOQUEADA'] },
      },
    });
    const ip = await cliente.tentativaLoginWeb.count({
      where: {
        criadoEm: { gte: desde },
        enderecoIp,
        resultado: { in: ['FALHA', 'BLOQUEADA'] },
      },
    });
    return { contaIp, ip };
  }

  public async registrarTentativa(
    tentativa: RegistroTentativaLoginWeb,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    const contexto = transacao ?? (await this.prisma.obterCliente());
    await contexto.tentativaLoginWeb.create({ data: tentativa });
  }

  public async criarSessao(
    sessao: {
      readonly id: string;
      readonly usuarioId: string;
      readonly tokenHash: string;
      readonly csrfHash: string;
      readonly enderecoIp: string;
      readonly agenteUsuarioHash: string;
      readonly autenticadaEm: Date;
      readonly expiraEm: Date;
    },
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    const contexto = transacao ?? (await this.prisma.obterCliente());
    await contexto.sessaoWeb.create({ data: sessao });
  }

  public async obterSessao(
    tokenHash: string,
    transacao?: TransacaoPrisma,
  ): Promise<SessaoWebPersistida | undefined> {
    const contexto = transacao ?? (await this.prisma.obterCliente());
    const sessao = await contexto.sessaoWeb.findUnique({
      select: {
        csrfHash: true,
        estado: true,
        expiraEm: true,
        id: true,
        tokenHash: true,
        usuario: { select: { estado: true, nomeExibicao: true } },
        usuarioId: true,
        versao: true,
      },
      where: { tokenHash },
    });
    if (sessao === null) {
      return undefined;
    }
    return {
      csrfHash: sessao.csrfHash,
      estado: sessao.estado,
      expiraEm: sessao.expiraEm,
      id: sessao.id,
      nomeExibicao: sessao.usuario.nomeExibicao,
      tokenHash: sessao.tokenHash,
      usuarioAtivo: sessao.usuario.estado === 'ATIVO',
      usuarioId: sessao.usuarioId,
      versao: sessao.versao,
    };
  }

  public async rotacionarSessao(
    sessaoId: string,
    tokenHashAtual: string,
    tokenHashNovo: string,
    csrfHashNovo: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.sessaoWeb.updateMany({
      data: {
        csrfHash: csrfHashNovo,
        rotacionadaEm: agora,
        tokenHash: tokenHashNovo,
        versao: { increment: 1 },
      },
      where: {
        estado: 'ATIVA',
        expiraEm: { gt: agora },
        id: sessaoId,
        tokenHash: tokenHashAtual,
      },
    });
    return resultado.count === 1;
  }

  public async revogarSessao(
    sessaoId: string,
    tokenHashAtual: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.sessaoWeb.updateMany({
      data: { estado: 'REVOGADA', revogadaEm: agora },
      where: {
        estado: 'ATIVA',
        id: sessaoId,
        tokenHash: tokenHashAtual,
      },
    });
    return resultado.count === 1;
  }
}
