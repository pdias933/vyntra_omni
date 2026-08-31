import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  DispositivoPareamentoQrNormalizado,
  PareamentoQrPersistido,
  RegistroTentativaResgateQr,
} from './modelo-pareamento-qr.js';
import type { RepositorioPareamentoQr } from './repositorio-pareamento-qr.js';

@Injectable()
export class RepositorioPareamentoQrPrisma implements RepositorioPareamentoQr {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async serializarGeracao(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear([`PAREAMENTO_QR_GERACAO:${usuarioId}`], transacao);
  }

  public async contarGeracoesUsuario(
    usuarioId: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    return transacao.pareamentoQr.count({
      where: { criadoEm: { gte: desde }, usuarioId },
    });
  }

  public async cancelarAtivosSessao(
    sessaoWebId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number> {
    const resultado = await transacao.pareamentoQr.updateMany({
      data: {
        estado: 'CANCELADO',
        finalizadoEm: agora,
        motivoFinalizacao: motivo,
      },
      where: {
        estado: {
          in: [
            'AGUARDANDO_RESGATE',
            'AGUARDANDO_CONFIRMACAO',
            'CONFIRMADO',
          ],
        },
        sessaoWebId,
      },
    });
    return resultado.count;
  }

  public async criar(
    pareamento: {
      readonly id: string;
      readonly usuarioId: string;
      readonly sessaoWebId: string;
      readonly tokenQrHash: string;
      readonly expiraEm: Date;
      readonly criadoEm: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.pareamentoQr.create({ data: pareamento });
  }

  public async serializarResgate(
    tokenQrHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear(
      [
        `PAREAMENTO_QR_DISPOSITIVO:${identificadorInstalacaoHash}`,
        `PAREAMENTO_QR_IP:${enderecoIp}`,
        `PAREAMENTO_QR_TOKEN:${tokenQrHash}`,
      ],
      transacao,
    );
  }

  public async contarTentativasResgate(
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly dispositivo: number; readonly ip: number }> {
    const [dispositivo, ip] = await Promise.all([
      transacao.tentativaResgatePareamentoQr.count({
        where: { criadoEm: { gte: desde }, identificadorInstalacaoHash },
      }),
      transacao.tentativaResgatePareamentoQr.count({
        where: { criadoEm: { gte: desde }, enderecoIp },
      }),
    ]);
    return { dispositivo, ip };
  }

  public async registrarTentativaResgate(
    tentativa: RegistroTentativaResgateQr,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await transacao.tentativaResgatePareamentoQr.create({ data: tentativa });
  }

  public async obterPorToken(
    tokenQrHash: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined> {
    const pareamento = await transacao.pareamentoQr.findUnique({
      select: this.selecao(),
      where: { tokenQrHash },
    });
    return pareamento === null ? undefined : this.mapear(pareamento);
  }

  public async resgatar(
    pareamentoId: string,
    comprovanteResgateHash: string,
    dispositivo: DispositivoPareamentoQrNormalizado,
    enderecoIp: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.pareamentoQr.updateMany({
      data: {
        comprovanteResgateHash,
        enderecoIpResgate: enderecoIp,
        estado: 'AGUARDANDO_CONFIRMACAO',
        identificadorInstalacaoHash:
          dispositivo.identificadorInstalacaoHash,
        modeloSanitizado: dispositivo.modeloSanitizado ?? null,
        plataforma: dispositivo.plataforma,
        resgatadoEm: agora,
        segredoVinculoHash: dispositivo.segredoVinculoHash,
        versaoAplicativo: dispositivo.versaoAplicativo,
      },
      where: {
        estado: 'AGUARDANDO_RESGATE',
        expiraEm: { gt: agora },
        id: pareamentoId,
      },
    });
    return resultado.count === 1;
  }

  public async serializarPareamento(
    pareamentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.bloquear([`PAREAMENTO_QR:${pareamentoId}`], transacao);
  }

  public async obterPorId(
    pareamentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined> {
    const pareamento = await transacao.pareamentoQr.findUnique({
      select: this.selecao(),
      where: { id: pareamentoId },
    });
    return pareamento === null ? undefined : this.mapear(pareamento);
  }

  public async obterPorComprovante(
    pareamentoId: string,
    comprovanteResgateHash: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined> {
    const pareamento = await transacao.pareamentoQr.findFirst({
      select: this.selecao(),
      where: { comprovanteResgateHash, id: pareamentoId },
    });
    return pareamento === null ? undefined : this.mapear(pareamento);
  }

  public async confirmar(
    pareamentoId: string,
    sessaoWebId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.pareamentoQr.updateMany({
      data: { confirmadoEm: agora, estado: 'CONFIRMADO' },
      where: {
        estado: 'AGUARDANDO_CONFIRMACAO',
        expiraEm: { gt: agora },
        id: pareamentoId,
        sessaoWebId,
      },
    });
    return resultado.count === 1;
  }

  public async concluir(
    pareamentoId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.pareamentoQr.updateMany({
      data: { concluidoEm: agora, estado: 'CONCLUIDO' },
      where: {
        estado: 'CONFIRMADO',
        expiraEm: { gt: agora },
        id: pareamentoId,
      },
    });
    return resultado.count === 1;
  }

  public async finalizar(
    pareamentoId: string,
    estado: 'CANCELADO' | 'EXPIRADO',
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    const resultado = await transacao.pareamentoQr.updateMany({
      data: { estado, finalizadoEm: agora, motivoFinalizacao: motivo },
      where: {
        estado: {
          in: [
            'AGUARDANDO_RESGATE',
            'AGUARDANDO_CONFIRMACAO',
            'CONFIRMADO',
          ],
        },
        id: pareamentoId,
      },
    });
    return resultado.count === 1;
  }

  private async bloquear(
    chaves: readonly string[],
    transacao: TransacaoPrisma,
  ): Promise<void> {
    for (const chave of [...chaves].sort()) {
      await transacao.$queryRaw(
        Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${chave}, 0)) AS text) AS bloqueio`,
      );
    }
  }

  private selecao() {
    return {
      confirmadoEm: true,
      estado: true,
      expiraEm: true,
      enderecoIpResgate: true,
      id: true,
      identificadorInstalacaoHash: true,
      modeloSanitizado: true,
      plataforma: true,
      resgatadoEm: true,
      segredoVinculoHash: true,
      sessaoWeb: {
        select: {
          autenticadaEm: true,
          estado: true,
          expiraEm: true,
        },
      },
      sessaoWebId: true,
      usuario: { select: { estado: true, nomeExibicao: true } },
      usuarioId: true,
      versaoAplicativo: true,
    } as const;
  }

  private mapear(pareamento: {
    readonly confirmadoEm: Date | null;
    readonly estado: PareamentoQrPersistido['estado'];
    readonly expiraEm: Date;
    readonly enderecoIpResgate: string | null;
    readonly id: string;
    readonly identificadorInstalacaoHash: string | null;
    readonly modeloSanitizado: string | null;
    readonly plataforma: 'ANDROID' | 'IOS' | null;
    readonly resgatadoEm: Date | null;
    readonly segredoVinculoHash: string | null;
    readonly sessaoWeb: {
      readonly autenticadaEm: Date;
      readonly estado: string;
      readonly expiraEm: Date;
    };
    readonly sessaoWebId: string;
    readonly usuario: { readonly estado: string; readonly nomeExibicao: string };
    readonly usuarioId: string;
    readonly versaoAplicativo: string | null;
  }): PareamentoQrPersistido {
    return {
      id: pareamento.id,
      usuarioId: pareamento.usuarioId,
      nomeExibicaoUsuario: pareamento.usuario.nomeExibicao,
      usuarioAtivo: pareamento.usuario.estado === 'ATIVO',
      sessaoWebId: pareamento.sessaoWebId,
      sessaoWebAtiva: pareamento.sessaoWeb.estado === 'ATIVA',
      sessaoWebExpiraEm: pareamento.sessaoWeb.expiraEm,
      sessaoWebAutenticadaEm: pareamento.sessaoWeb.autenticadaEm,
      estado: pareamento.estado,
      expiraEm: pareamento.expiraEm,
      ...(pareamento.identificadorInstalacaoHash === null
        ? {}
        : { identificadorInstalacaoHash: pareamento.identificadorInstalacaoHash }),
      ...(pareamento.segredoVinculoHash === null
        ? {}
        : { segredoVinculoHash: pareamento.segredoVinculoHash }),
      ...(pareamento.plataforma === null
        ? {}
        : { plataforma: pareamento.plataforma }),
      ...(pareamento.modeloSanitizado === null
        ? {}
        : { modeloSanitizado: pareamento.modeloSanitizado }),
      ...(pareamento.versaoAplicativo === null
        ? {}
        : { versaoAplicativo: pareamento.versaoAplicativo }),
      ...(pareamento.enderecoIpResgate === null
        ? {}
        : { enderecoIpResgate: pareamento.enderecoIpResgate }),
      ...(pareamento.resgatadoEm === null
        ? {}
        : { resgatadoEm: pareamento.resgatadoEm }),
      ...(pareamento.confirmadoEm === null
        ? {}
        : { confirmadoEm: pareamento.confirmadoEm }),
    };
  }
}
