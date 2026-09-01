import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../gerado/prisma/client.js';
import { obterUrlBanco } from './obter-url-banco.js';
import type { TransacaoPrisma } from './transacao-prisma.js';

const MIGRACAO_OBRIGATORIA =
  '20260901014000_marcador_leitura_web';

@Injectable()
export class ServicoPrisma implements OnModuleDestroy {
  private cliente: PrismaClient | undefined;
  private inicializacao: Promise<PrismaClient> | undefined;

  public async obterCliente(): Promise<PrismaClient> {
    if (this.cliente !== undefined) {
      return this.cliente;
    }

    this.inicializacao ??= this.inicializar();

    try {
      this.cliente = await this.inicializacao;
      return this.cliente;
    } catch (erro) {
      this.inicializacao = undefined;
      throw erro;
    }
  }

  public async verificarMigracaoObrigatoria(): Promise<boolean> {
    const cliente = await this.obterCliente();
    const resultado = await cliente.$queryRaw<Array<{ aplicada: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE migration_name = ${MIGRACAO_OBRIGATORIA}
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        ) AS aplicada
      `,
    );

    return resultado[0]?.aplicada === true;
  }

  public async executarTransacao<Resultado>(
    operacao: (transacao: TransacaoPrisma) => Promise<Resultado>,
  ): Promise<Resultado> {
    const cliente = await this.obterCliente();
    return cliente.$transaction(operacao, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    });
  }

  public async executarLeituraConsistente<Resultado>(
    operacao: (transacao: TransacaoPrisma) => Promise<Resultado>,
  ): Promise<Resultado> {
    const cliente = await this.obterCliente();
    return cliente.$transaction(
      async (transacao) => {
        await transacao.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        return operacao(transacao);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.cliente !== undefined) {
      await this.cliente.$disconnect();
    }
  }

  private async inicializar(): Promise<PrismaClient> {
    const adapter = new PrismaPg({
      connectionString: await obterUrlBanco(),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 5,
    });
    const cliente = new PrismaClient({ adapter });
    await cliente.$connect();
    return cliente;
  }
}
