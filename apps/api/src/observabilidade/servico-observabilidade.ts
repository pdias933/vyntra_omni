import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ServicoProntidao } from '../saude/servico-prontidao.js';
import type {
  AlertaOperacional,
  MetricaBacklog,
  PainelObservabilidade,
} from './modelo-observabilidade.js';
import { registroMetricasOperacionais } from './registro-metricas.js';

const RECURSO_OBSERVABILIDADE = '11111111-1111-4111-8111-111111111111';
const LIMITES_PADRAO = {
  caixaSaidaSegundos: 300,
  fluxoSegundos: 300,
  operacaoSegundos: 900,
} as const;

function calcularIdadeSegundos(data: Date | null, agora: Date): number {
  if (data === null) return 0;
  return Math.max(0, Math.floor((agora.getTime() - data.getTime()) / 1_000));
}

function criarBacklog(
  quantidade: number,
  dataMaisAntiga: Date | null,
  agora: Date,
): MetricaBacklog {
  return {
    idadeItemMaisAntigoSegundos: calcularIdadeSegundos(dataMaisAntiga, agora),
    quantidade,
  };
}

@Injectable()
export class ServicoObservabilidade {
  public constructor(
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoProntidao) private readonly prontidao: ServicoProntidao,
  ) {}

  public async observar(
    sessao: ContextoSessaoAutorizacao,
    agora: Date = new Date(),
  ): Promise<PainelObservabilidade> {
    const dados = await this.prisma.executarLeituraConsistente(
      async (transacao) => {
        await this.autorizacao.autorizar(
          {
            permissao: 'ADMINISTRAR_INTEGRACOES',
            recurso: {
              id: RECURSO_OBSERVABILIDADE,
              tipo: 'OBSERVABILIDADE',
            },
            sessao,
          },
          async () => ({ acessivel: true, estadoPermiteAcao: true }),
          transacao,
        );
        return this.coletarDados(transacao, agora);
      },
    );
    return this.comporPainel(dados, agora);
  }

  public async coletarInternamente(
    agora: Date = new Date(),
  ): Promise<PainelObservabilidade> {
    const dados = await this.prisma.executarLeituraConsistente((transacao) =>
      this.coletarDados(transacao, agora),
    );
    return this.comporPainel(dados, agora);
  }

  private async coletarDados(transacao: TransacaoPrisma, agora: Date) {
    const [caixaQuantidade, caixaMaisAntiga, operacoesQuantidade, operacaoMaisAntiga, fluxosQuantidade, fluxoMaisAntigo] = await Promise.all([
          transacao.itemCaixaSaida.count({ where: { estado: 'PENDENTE' } }),
          transacao.itemCaixaSaida.findFirst({ orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }], select: { criadoEm: true }, where: { estado: 'PENDENTE' } }),
          transacao.operacaoRecuperavel.count({ where: { estado: { in: ['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA', 'RESULTADO_INCERTO'] } } }),
          transacao.operacaoRecuperavel.findFirst({ orderBy: [{ atualizadoEm: 'asc' }, { id: 'asc' }], select: { atualizadoEm: true }, where: { estado: { in: ['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA', 'RESULTADO_INCERTO'] } } }),
          transacao.execucaoFluxo.count({ where: { estado: { in: ['EXECUTANDO', 'AGUARDANDO_RESPOSTA', 'AGUARDANDO_SISTEMA'] }, retomarEm: { lte: agora } } }),
          transacao.execucaoFluxo.findFirst({ orderBy: [{ retomarEm: 'asc' }, { id: 'asc' }], select: { retomarEm: true }, where: { estado: { in: ['EXECUTANDO', 'AGUARDANDO_RESPOSTA', 'AGUARDANDO_SISTEMA'] }, retomarEm: { lte: agora } } }),
        ]);
    return {
      caixa: criarBacklog(caixaQuantidade, caixaMaisAntiga?.criadoEm ?? null, agora),
      fluxos: criarBacklog(fluxosQuantidade, fluxoMaisAntigo?.retomarEm ?? null, agora),
      operacoes: criarBacklog(operacoesQuantidade, operacaoMaisAntiga?.atualizadoEm ?? null, agora),
    };
  }

  private async comporPainel(
    dados: {
      readonly caixa: MetricaBacklog;
      readonly fluxos: MetricaBacklog;
      readonly operacoes: MetricaBacklog;
    },
    agora: Date,
  ): Promise<PainelObservabilidade> {
    const prontidao = await this.prontidao.verificar();
    const alertas = this.avaliarAlertas(dados, prontidao.falhas);
    return {
      alertas,
      coletadoEm: agora,
      metricas: {
        caixaSaida: dados.caixa,
        fluxos: dados.fluxos,
        http: registroMetricasOperacionais.resumirHttp(),
        operacoesRecuperaveis: dados.operacoes,
      },
      versaoRegras: 1,
    };
  }

  private avaliarAlertas(
    dados: {
      readonly caixa: MetricaBacklog;
      readonly fluxos: MetricaBacklog;
      readonly operacoes: MetricaBacklog;
    },
    falhas: readonly string[],
  ): readonly AlertaOperacional[] {
    const alertas: AlertaOperacional[] = [];
    for (const componente of ['POSTGRESQL', 'REDIS', 'STORAGE'] as const) {
      if (
        falhas.includes(componente) ||
        (componente === 'POSTGRESQL' && falhas.includes('MIGRACAO_POSTGRESQL'))
      ) {
        alertas.push({
          codigo: 'DEPENDENCIA_INDISPONIVEL',
          componente,
          limite: 0,
          runbook: `DEPENDENCIA_${componente}`,
          severidade: 'CRITICA',
          unidade: 'ESTADO',
          valorAtual: 1,
        });
      }
    }
    this.adicionarAlertaBacklog(alertas, dados.caixa, {
      codigo: 'CAIXA_SAIDA_ATRASADA',
      componente: 'CAIXA_SAIDA',
      limite: LIMITES_PADRAO.caixaSaidaSegundos,
      runbook: 'CAIXA_SAIDA_BACKLOG',
      severidade: 'ALTA',
    });
    this.adicionarAlertaBacklog(alertas, dados.operacoes, {
      codigo: 'OPERACAO_RECUPERAVEL_ATRASADA',
      componente: 'OPERACOES_RECUPERAVEIS',
      limite: LIMITES_PADRAO.operacaoSegundos,
      runbook: 'OPERACAO_RECUPERAVEL_PRESA',
      severidade: 'ALTA',
    });
    this.adicionarAlertaBacklog(alertas, dados.fluxos, {
      codigo: 'FLUXO_ATRASADO',
      componente: 'MOTOR_FLUXOS',
      limite: LIMITES_PADRAO.fluxoSegundos,
      runbook: 'WORKER_FLUXOS_BACKLOG',
      severidade: 'MEDIA',
    });
    return alertas;
  }

  private adicionarAlertaBacklog(
    alertas: AlertaOperacional[],
    metrica: MetricaBacklog,
    regra: Pick<
      AlertaOperacional,
      'codigo' | 'componente' | 'limite' | 'runbook' | 'severidade'
    >,
  ): void {
    if (
      metrica.quantidade === 0 ||
      metrica.idadeItemMaisAntigoSegundos <= regra.limite
    ) {
      return;
    }
    alertas.push({
      ...regra,
      unidade: 'SEGUNDOS',
      valorAtual: metrica.idadeItemMaisAntigoSegundos,
    });
  }
}
