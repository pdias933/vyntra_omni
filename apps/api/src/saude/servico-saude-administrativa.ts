import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { EstadoOperacaoRecuperavel } from '../idempotencia/modelo-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ComponenteSaudeAdministrativa,
  OperacaoSaudeAdministrativa,
  PainelSaudeAdministrativa,
} from './modelo-saude-administrativa.js';
import { ServicoProntidao } from './servico-prontidao.js';

const RECURSO_SAUDE_ADMINISTRATIVA =
  '11111111-1111-4111-8111-111111111196';
const ESTADOS_VISIVEIS: readonly EstadoOperacaoRecuperavel[] = [
  'AGUARDANDO_NOVA_TENTATIVA',
  'RESULTADO_INCERTO',
  'FALHA_DEFINITIVA',
];
const ESTADOS_REPROCESSAVEIS: readonly EstadoOperacaoRecuperavel[] = [
  'AGUARDANDO_NOVA_TENTATIVA',
  'RESULTADO_INCERTO',
];

@Injectable()
export class ServicoSaudeAdministrativa {
  public constructor(
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
    @Inject(ServicoProntidao)
    private readonly prontidao: ServicoProntidao,
  ) {}

  public async listar(
    sessao: ContextoSessaoAutorizacao,
  ): Promise<PainelSaudeAdministrativa> {
    const dados = await this.prisma.executarLeituraConsistente(
      async (transacao) => {
        await this.autorizar(sessao, transacao);
        const [contagens, itensCaixaSaidaPendentes, operacoes] =
          await Promise.all([
            transacao.operacaoRecuperavel.groupBy({
              _count: { _all: true },
              by: ['estado'],
            }),
            transacao.itemCaixaSaida.count({
              where: { estado: 'PENDENTE' },
            }),
            transacao.operacaoRecuperavel.findMany({
              orderBy: [{ atualizadoEm: 'desc' }, { id: 'asc' }],
              select: {
                atualizadoEm: true,
                codigoUltimoErro: true,
                estado: true,
                id: true,
                proximaAcaoEm: true,
                tentativas: true,
                tipo: true,
                versao: true,
              },
              take: 50,
              where: { estado: { in: [...ESTADOS_VISIVEIS] } },
            }),
          ]);
        return { contagens, itensCaixaSaidaPendentes, operacoes };
      },
    );
    const prontidao = await this.prontidao.verificar();
    const porEstado = new Map(
      dados.contagens.map((item) => [item.estado, item._count._all]),
    );
    return {
      componentes: this.mapearComponentes(prontidao.falhas),
      operacoes: dados.operacoes.map((operacao) =>
        this.mapearOperacao(operacao),
      ),
      resumo: {
        aguardandoNovaTentativa:
          porEstado.get('AGUARDANDO_NOVA_TENTATIVA') ?? 0,
        falhasDefinitivas: porEstado.get('FALHA_DEFINITIVA') ?? 0,
        itensCaixaSaidaPendentes: dados.itensCaixaSaidaPendentes,
        resultadosIncertos: porEstado.get('RESULTADO_INCERTO') ?? 0,
      },
    };
  }

  public async reprocessarAgora(
    sessao: ContextoSessaoAutorizacao,
    operacaoId: string,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
    agora: Date = new Date(),
  ): Promise<OperacaoSaudeAdministrativa | undefined> {
    if (!Number.isInteger(versaoEsperada) || versaoEsperada < 0) {
      return undefined;
    }
    await this.autorizar(sessao, transacao);
    const operacao = await transacao.operacaoRecuperavel.findUnique({
      select: {
        atualizadoEm: true,
        codigoUltimoErro: true,
        estado: true,
        id: true,
        proximaAcaoEm: true,
        tentativas: true,
        tipo: true,
        versao: true,
      },
      where: { id: operacaoId },
    });
    if (
      operacao === null ||
      operacao.versao !== versaoEsperada ||
      !ESTADOS_REPROCESSAVEIS.includes(operacao.estado)
    ) {
      return undefined;
    }
    const alteracao = await transacao.operacaoRecuperavel.updateMany({
      data: {
        proximaAcaoEm: agora,
        versao: { increment: 1 },
      },
      where: {
        estado: { in: [...ESTADOS_REPROCESSAVEIS] },
        id: operacaoId,
        versao: versaoEsperada,
      },
    });
    if (alteracao.count !== 1) return undefined;
    await this.auditoria.registrar(
      {
        acao: 'REPROCESSAR_OPERACAO_AGORA',
        dadosAnteriores: {
          estado: operacao.estado,
          proximaAcaoEm: operacao.proximaAcaoEm,
          versao: operacao.versao,
        },
        dadosNovos: {
          estado: operacao.estado,
          proximaAcaoEm: agora,
          versao: operacao.versao + 1,
        },
        entidadeId: operacao.id,
        entidadeTipo: 'OPERACAO_RECUPERAVEL',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'OPERACAO_REPROCESSAMENTO_ANTECIPADO',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return this.mapearOperacao({
      ...operacao,
      atualizadoEm: agora,
      proximaAcaoEm: agora,
      versao: operacao.versao + 1,
    });
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_INTEGRACOES',
        recurso: {
          id: RECURSO_SAUDE_ADMINISTRATIVA,
          tipo: 'SAUDE_ADMINISTRATIVA',
        },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private mapearComponentes(
    falhasRecebidas: readonly string[],
  ): readonly ComponenteSaudeAdministrativa[] {
    const falhas = new Set(falhasRecebidas);
    const configuracaoInvalida = falhas.has(
      'CONFIGURACAO_DEPENDENCIA_INVALIDA',
    );
    const configurados = {
      POSTGRESQL:
        process.env.BANCO_URL_FILE !== undefined ||
        process.env.BANCO_HOST !== undefined,
      REDIS:
        process.env.REDIS_URL_FILE !== undefined ||
        process.env.REDIS_HOST !== undefined,
      STORAGE: process.env.STORAGE_ENDPOINT !== undefined,
    };
    return [
      { codigo: 'API', estado: 'OPERACIONAL' },
      ...(['POSTGRESQL', 'REDIS', 'STORAGE'] as const).map((codigo) => ({
        codigo,
        estado: !configurados[codigo]
          ? ('NAO_CONFIGURADO' as const)
          : configuracaoInvalida ||
              falhas.has(codigo) ||
              (codigo === 'POSTGRESQL' &&
                falhas.has('MIGRACAO_POSTGRESQL'))
            ? ('INDISPONIVEL' as const)
            : ('OPERACIONAL' as const),
      })),
    ];
  }

  private mapearOperacao(operacao: {
    readonly atualizadoEm: Date;
    readonly codigoUltimoErro: string | null;
    readonly estado: EstadoOperacaoRecuperavel;
    readonly id: string;
    readonly proximaAcaoEm: Date | null;
    readonly tentativas: number;
    readonly tipo: string;
    readonly versao: number;
  }): OperacaoSaudeAdministrativa {
    return {
      atualizadoEm: operacao.atualizadoEm,
      ...(operacao.codigoUltimoErro === null
        ? {}
        : { codigoUltimoErro: operacao.codigoUltimoErro }),
      estado: operacao.estado,
      id: operacao.id,
      ...(operacao.proximaAcaoEm === null
        ? {}
        : { proximaAcaoEm: operacao.proximaAcaoEm }),
      podeReprocessar: ESTADOS_REPROCESSAVEIS.includes(operacao.estado),
      tentativas: operacao.tentativas,
      tipo: operacao.tipo,
      versao: operacao.versao,
    };
  }
}
