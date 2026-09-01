import { Inject, Injectable } from '@nestjs/common';

import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ContaWhatsAppPersistida } from './modelo-conta-whatsapp.js';
import type { RepositorioContaWhatsApp } from './repositorio-conta-whatsapp.js';

function possuiCodigoPrisma(erro: unknown, codigo: string): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    erro.code === codigo
  );
}

@Injectable()
export class RepositorioContaWhatsAppPrisma
  implements RepositorioContaWhatsApp
{
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async criar(
    conta: ContaWhatsAppPersistida,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    try {
      await transacao.contaWhatsApp.create({
        data: {
          atualizadoEm: conta.atualizadaEm,
          criadoEm: conta.criadaEm,
          estado: conta.estado,
          id: conta.id,
          identificadorCanalExterno: conta.identificadorCanalExterno,
          nomeExibicao: conta.nomeExibicao,
          portfolioEmpresarialExternoId:
            conta.portfolioEmpresarialExternoId,
          telefoneExibicaoE164: conta.telefoneExibicaoE164 ?? null,
          versao: conta.versao,
        },
      });
      return true;
    } catch (erro) {
      if (possuiCodigoPrisma(erro, 'P2002')) {
        return false;
      }
      throw erro;
    }
  }

  public async listar(
    transacao?: TransacaoPrisma,
  ): Promise<readonly ContaWhatsAppPersistida[]> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const contas = await cliente.contaWhatsApp.findMany({
      orderBy: [{ nomeExibicao: 'asc' }, { id: 'asc' }],
    });
    return contas.map((conta) => this.mapear(conta));
  }

  public async obterPorId(
    contaWhatsAppId: string,
    transacao?: TransacaoPrisma,
  ): Promise<ContaWhatsAppPersistida | undefined> {
    const cliente = transacao ?? (await this.prisma.obterCliente());
    const conta = await cliente.contaWhatsApp.findUnique({
      where: { id: contaWhatsAppId },
    });
    return conta === null ? undefined : this.mapear(conta);
  }

  private mapear(conta: {
    readonly id: string;
    readonly nomeExibicao: string;
    readonly portfolioEmpresarialExternoId: string;
    readonly identificadorCanalExterno: string;
    readonly telefoneExibicaoE164: string | null;
    readonly estado: 'ATIVA' | 'INATIVA';
    readonly versao: number;
    readonly criadoEm: Date;
    readonly atualizadoEm: Date;
  }): ContaWhatsAppPersistida {
    return {
      atualizadaEm: conta.atualizadoEm,
      criadaEm: conta.criadoEm,
      estado: conta.estado,
      id: conta.id,
      identificadorCanalExterno: conta.identificadorCanalExterno,
      nomeExibicao: conta.nomeExibicao,
      portfolioEmpresarialExternoId: conta.portfolioEmpresarialExternoId,
      versao: conta.versao,
      ...(conta.telefoneExibicaoE164 === null
        ? {}
        : { telefoneExibicaoE164: conta.telefoneExibicaoE164 }),
    };
  }
}
