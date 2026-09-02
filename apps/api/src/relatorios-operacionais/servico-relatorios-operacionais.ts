import { Inject, Injectable } from '@nestjs/common';

import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { PeriodoRelatorio, RelatorioOperacional } from './modelo-relatorios-operacionais.js';

const DURACAO: Readonly<Record<PeriodoRelatorio, number>> = { '24H': 86_400_000, '7D': 604_800_000, '30D': 2_592_000_000 };
const ESTADOS_FLUXO_ATIVOS = ['EXECUTANDO', 'AGUARDANDO_RESPOSTA', 'AGUARDANDO_SISTEMA', 'AGUARDANDO_ATENDENTE'] as const;
const ESTADOS_ERP_PENDENTES = ['PENDENTE', 'EM_EXECUCAO', 'AGUARDANDO_NOVA_TENTATIVA', 'EM_RECONCILIACAO'] as const;

@Injectable()
export class ServicoRelatoriosOperacionais {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async obter(sessao: ContextoSessaoAutorizacao, periodo: PeriodoRelatorio, fim: Date = new Date()): Promise<RelatorioOperacional> {
    const inicio = new Date(fim.getTime() - DURACAO[periodo]);
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const filas = await this.filasAutorizadas(sessao, transacao);
      const ids = filas.map(({ id }) => id);
      if (ids.length === 0) return this.vazio(periodo, inicio, fim);
      const escopoAtendimento = { filaAtualId: { in: ids } } as const;
      const [atendimentos, sla, mensagens, fluxos, erp] = await Promise.all([
        transacao.atendimento.groupBy({
          _count: { _all: true }, by: ['filaAtualId', 'estado'],
          where: { atualizadoEm: { gte: inicio, lt: fim }, ...escopoAtendimento },
        }),
        transacao.alertaSla.groupBy({
          _count: { _all: true }, by: ['nivel'],
          where: { emitidoEm: { gte: inicio, lt: fim }, relogioSla: { atendimento: escopoAtendimento } },
        }),
        transacao.mensagem.groupBy({
          _count: { _all: true }, by: ['direcao', 'estadoSaida'],
          where: { recebidaServidorEm: { gte: inicio, lt: fim }, atendimento: escopoAtendimento },
        }),
        transacao.execucaoFluxo.groupBy({
          _count: { _all: true }, by: ['estado'],
          where: { atualizadaEm: { gte: inicio, lt: fim }, atendimento: escopoAtendimento },
        }),
        transacao.operacaoRecuperavel.groupBy({
          _count: { _all: true }, by: ['estado'],
          where: {
            atualizadoEm: { gte: inicio, lt: fim },
            OR: [
              { acaoAtendimentoErp: { is: { atendimento: escopoAtendimento } } },
              { desbloqueioConfianca: { is: { atendimento: escopoAtendimento } } },
              { ordemServicoCriada: { is: { atendimento: escopoAtendimento } } },
              { atualizacaoOrdemServico: { is: { ordemServico: { atendimento: escopoAtendimento } } } },
            ],
          },
        }),
      ]);
      const contar = <T extends { readonly _count: { readonly _all: number } }>(itens: readonly T[], filtro: (item: T) => boolean) => itens.filter(filtro).reduce((total, item) => total + item._count._all, 0);
      const saidasAceitas = contar(mensagens, (item) => item.direcao === 'SAIDA' && ['ENVIADA', 'ENTREGUE', 'LIDA'].includes(item.estadoSaida ?? ''));
      const entregues = contar(mensagens, (item) => item.direcao === 'SAIDA' && ['ENTREGUE', 'LIDA'].includes(item.estadoSaida ?? ''));
      return {
        erp: {
          concluidas: contar(erp, (item) => item.estado === 'CONCLUIDA'),
          falhasDefinitivas: contar(erp, (item) => item.estado === 'FALHA_DEFINITIVA'),
          pendentes: contar(erp, (item) => ESTADOS_ERP_PENDENTES.includes(item.estado as typeof ESTADOS_ERP_PENDENTES[number])),
          resultadosIncertos: contar(erp, (item) => item.estado === 'RESULTADO_INCERTO'),
        },
        filas: filas.map((fila) => ({
          aguardando: contar(atendimentos, (item) => item.filaAtualId === fila.id && item.estado === 'AGUARDANDO'),
          emAtendimento: contar(atendimentos, (item) => item.filaAtualId === fila.id && item.estado === 'EM_ATENDIMENTO'),
          encerrados: contar(atendimentos, (item) => item.filaAtualId === fila.id && ['ENCERRADO', 'ENCERRADO_REABRIVEL'].includes(item.estado)),
          filaId: fila.id, nome: fila.nome,
        })),
        fim, formulasVersao: '1', inicio,
        fluxos: {
          ativos: contar(fluxos, (item) => ESTADOS_FLUXO_ATIVOS.includes(item.estado as typeof ESTADOS_FLUXO_ATIVOS[number])),
          concluidos: contar(fluxos, (item) => item.estado === 'CONCLUIDA'),
          falhas: contar(fluxos, (item) => item.estado === 'FALHOU'),
        },
        mensagens: {
          entregues,
          enviadas: saidasAceitas,
          falhas: contar(mensagens, (item) => item.direcao === 'SAIDA' && item.estadoSaida === 'FALHOU'),
          lidas: contar(mensagens, (item) => item.direcao === 'SAIDA' && item.estadoSaida === 'LIDA'),
          recebidas: contar(mensagens, (item) => item.direcao === 'ENTRADA'),
          taxaEntrega: saidasAceitas === 0 ? 0 : Number((entregues / saidasAceitas).toFixed(4)),
        },
        periodo,
        sla: {
          administrador: contar(sla, (item) => item.nivel === 'ADMINISTRADOR'),
          atendente: contar(sla, (item) => item.nivel === 'ATENDENTE'),
          supervisor: contar(sla, (item) => item.nivel === 'SUPERVISOR'),
        },
      };
    });
  }

  private async filasAutorizadas(sessao: ContextoSessaoAutorizacao, transacao: TransacaoPrisma) {
    const filas = await transacao.fila.findMany({ orderBy: [{ nome: 'asc' }, { id: 'asc' }], select: { id: true, nome: true }, where: { estado: 'ATIVA' } });
    const autorizadas: typeof filas = [];
    for (const fila of filas) {
      try {
        await this.autorizacao.autorizar(
          { filaId: fila.id, permissao: 'VISUALIZAR_FILA', recurso: { id: fila.id, tipo: 'FILA' }, sessao },
          async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao,
        );
        autorizadas.push(fila);
      } catch (erro) {
        if (!(erro instanceof ErroPermissaoNegada)) throw erro;
      }
    }
    return autorizadas;
  }

  private vazio(periodo: PeriodoRelatorio, inicio: Date, fim: Date): RelatorioOperacional {
    return { erp: { concluidas: 0, falhasDefinitivas: 0, pendentes: 0, resultadosIncertos: 0 }, filas: [], fim, formulasVersao: '1', fluxos: { ativos: 0, concluidos: 0, falhas: 0 }, inicio, mensagens: { entregues: 0, enviadas: 0, falhas: 0, lidas: 0, recebidas: 0, taxaEntrega: 0 }, periodo, sla: { administrador: 0, atendente: 0, supervisor: 0 } };
  }
}
