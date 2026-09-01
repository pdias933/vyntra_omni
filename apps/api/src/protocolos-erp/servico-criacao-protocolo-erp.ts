import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { EscritasErp } from '../erp/adaptador-erp.js';
import type {
  ComandoCriarAtendimentoErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoReconciliacaoAtendimentoErp,
} from '../erp/modelo-erp.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import type {
  EstadoOperacaoRecuperavel,
  ResultadoIdempotencia,
} from '../idempotencia/modelo-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import { ServicoProtocolosErp } from './servico-protocolos-erp.js';

const DURACAO_CONCESSAO_PADRAO_MS = 60_000;

export interface EntradaCriacaoProtocoloErp {
  readonly comando: ComandoCriarAtendimentoErp;
  readonly proximaAcaoEm: Date;
  readonly duracaoConcessaoMs?: number;
}

export type SituacaoCriacaoProtocoloErp =
  | 'AGUARDANDO_NOVA_TENTATIVA'
  | 'CONCLUIDO'
  | 'CRIACAO_NECESSARIA'
  | 'FALHA_DEFINITIVA'
  | 'PROCESSAMENTO_EM_CURSO'
  | 'RECONCILIACAO_NECESSARIA';

export interface ResultadoFluxoProtocoloErp {
  readonly operacaoId: string;
  readonly situacao: SituacaoCriacaoProtocoloErp;
  readonly protocoloOficial?: string;
}

@Injectable()
export class ServicoCriacaoProtocoloErp {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoIdempotencia)
    private readonly idempotencia: ServicoIdempotencia,
    @Inject(ServicoProtocolosErp)
    private readonly protocolos: ServicoProtocolosErp,
  ) {}

  public async executarCriacao(
    entrada: EntradaCriacaoProtocoloErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoFluxoProtocoloErp> {
    const preparada = await this.preparar(entrada.comando);
    const situacaoExistente = this.situacaoAntesDaCriacao(
      preparada.operacao.estado,
      preparada.operacao.proximaAcaoEm,
    );
    if (situacaoExistente !== undefined) {
      return {
        operacaoId: preparada.operacao.id,
        situacao: situacaoExistente,
      };
    }

    const concessao = await this.idempotencia.concederExecucao(
      preparada.operacao.id,
      entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
    );
    let resultado: ResultadoCriacaoAtendimentoErp;
    try {
      resultado = await adaptador.criarAtendimento(entrada.comando);
    } catch {
      await this.idempotencia.registrarResultadoIncerto({
        codigo: 'FALHA_ADAPTADOR_INESPERADA',
        operacaoId: concessao.operacaoId,
        proximaAcaoEm: entrada.proximaAcaoEm,
        tokenConcessao: concessao.tokenConcessao,
      });
      return {
        operacaoId: concessao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmar(
        entrada.comando.atendimentoId,
        concessao.operacaoId,
        concessao.tokenConcessao,
        resultado,
      );
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.idempotencia.registrarResultadoIncerto({
        codigo: resultado.codigo,
        operacaoId: concessao.operacaoId,
        proximaAcaoEm: entrada.proximaAcaoEm,
        tokenConcessao: concessao.tokenConcessao,
      });
      return {
        operacaoId: concessao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    await this.idempotencia.registrarFalhaTemporaria({
      codigo: resultado.codigo,
      operacaoId: concessao.operacaoId,
      proximaAcaoEm: entrada.proximaAcaoEm,
      tokenConcessao: concessao.tokenConcessao,
    });
    return {
      operacaoId: concessao.operacaoId,
      situacao: 'AGUARDANDO_NOVA_TENTATIVA',
    };
  }

  public async reconciliarCriacao(
    entrada: EntradaCriacaoProtocoloErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoFluxoProtocoloErp> {
    const preparada = await this.preparar(entrada.comando);
    const situacaoExistente = this.situacaoAntesDaReconciliacao(
      preparada.operacao.estado,
      preparada.operacao.proximaAcaoEm,
    );
    if (situacaoExistente !== undefined) {
      return {
        operacaoId: preparada.operacao.id,
        situacao: situacaoExistente,
      };
    }

    const concessao = await this.idempotencia.concederReconciliacao(
      preparada.operacao.id,
      entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
    );
    let resultado: ResultadoReconciliacaoAtendimentoErp;
    try {
      resultado = await adaptador.reconciliarCriacaoAtendimento({
        atendimentoId: entrada.comando.atendimentoId,
        chaveIdempotencia: entrada.comando.chaveIdempotencia,
      });
    } catch {
      await this.idempotencia.registrarResultadoIncerto({
        codigo: 'FALHA_RECONCILIACAO_INESPERADA',
        operacaoId: concessao.operacaoId,
        proximaAcaoEm: entrada.proximaAcaoEm,
        tokenConcessao: concessao.tokenConcessao,
      });
      return {
        operacaoId: concessao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmar(
        entrada.comando.atendimentoId,
        concessao.operacaoId,
        concessao.tokenConcessao,
        resultado,
      );
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      await this.idempotencia.registrarEfeitoAusente({
        operacaoId: concessao.operacaoId,
        proximaAcaoEm: entrada.proximaAcaoEm,
        tokenConcessao: concessao.tokenConcessao,
      });
      return {
        operacaoId: concessao.operacaoId,
        situacao: 'AGUARDANDO_NOVA_TENTATIVA',
      };
    }

    await this.idempotencia.registrarResultadoIncerto({
      codigo: resultado.codigo,
      operacaoId: concessao.operacaoId,
      proximaAcaoEm: entrada.proximaAcaoEm,
      tokenConcessao: concessao.tokenConcessao,
    });
    return {
      operacaoId: concessao.operacaoId,
      situacao: 'RECONCILIACAO_NECESSARIA',
    };
  }

  private async preparar(
    comando: ComandoCriarAtendimentoErp,
  ): Promise<ResultadoIdempotencia> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.protocolos.inicializarPendente(
        comando.atendimentoId,
        transacao,
      );
      return this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinar(comando),
          chaveIdempotencia: comando.chaveIdempotencia,
          entidadeId: comando.atendimentoId,
          entidadeTipo: 'ATENDIMENTO',
          escopoId: comando.atendimentoId,
          escopoTipo: 'ATENDIMENTO',
          tipoOperacao: 'CRIAR_PROTOCOLO_ERP',
        },
        transacao,
      );
    });
  }

  private async confirmar(
    atendimentoId: string,
    operacaoId: string,
    tokenConcessao: string,
    resultado:
      | Extract<ResultadoCriacaoAtendimentoErp, { resultado: 'CONFIRMADO' }>
      | Extract<
          ResultadoReconciliacaoAtendimentoErp,
          { resultado: 'CONFIRMADO' }
        >,
  ): Promise<ResultadoFluxoProtocoloErp> {
    const protocolo = await this.prisma.executarTransacao(
      async (transacao) => {
        const confirmado = await this.protocolos.aplicarResultado(
          atendimentoId,
          resultado,
          transacao,
        );
        await this.idempotencia.concluir(
          {
            dados: {
              atendimentoId,
              protocoloOficial: confirmado.protocoloOficial,
            },
            operacaoId,
            tokenConcessao,
          },
          transacao,
        );
        return confirmado;
      },
    );
    if (protocolo.protocoloOficial === undefined) {
      throw new Error('PROTOCOLO_ERP_CONFIRMADO_SEM_NUMERO');
    }
    return {
      operacaoId,
      protocoloOficial: protocolo.protocoloOficial,
      situacao: 'CONCLUIDO',
    };
  }

  private situacaoAntesDaCriacao(
    estado: EstadoOperacaoRecuperavel,
    proximaAcaoEm: Date | undefined,
  ): SituacaoCriacaoProtocoloErp | undefined {
    if (estado === 'CONCLUIDA') return 'CONCLUIDO';
    if (estado === 'FALHA_DEFINITIVA') return 'FALHA_DEFINITIVA';
    if (estado === 'RESULTADO_INCERTO' || estado === 'EM_RECONCILIACAO') {
      return 'RECONCILIACAO_NECESSARIA';
    }
    if (estado === 'EM_EXECUCAO') return 'PROCESSAMENTO_EM_CURSO';
    if (proximaAcaoEm !== undefined && proximaAcaoEm > new Date()) {
      return 'AGUARDANDO_NOVA_TENTATIVA';
    }
    return undefined;
  }

  private situacaoAntesDaReconciliacao(
    estado: EstadoOperacaoRecuperavel,
    proximaAcaoEm: Date | undefined,
  ): SituacaoCriacaoProtocoloErp | undefined {
    if (estado === 'CONCLUIDA') return 'CONCLUIDO';
    if (estado === 'FALHA_DEFINITIVA') return 'FALHA_DEFINITIVA';
    if (estado === 'PENDENTE' || estado === 'AGUARDANDO_NOVA_TENTATIVA') {
      return 'CRIACAO_NECESSARIA';
    }
    if (estado === 'EM_EXECUCAO' || estado === 'EM_RECONCILIACAO') {
      return 'PROCESSAMENTO_EM_CURSO';
    }
    if (proximaAcaoEm !== undefined && proximaAcaoEm > new Date()) {
      return 'RECONCILIACAO_NECESSARIA';
    }
    return undefined;
  }

  private assinar(comando: ComandoCriarAtendimentoErp): string {
    const canonico = JSON.stringify({
      assunto: comando.assunto,
      atendimentoId: comando.atendimentoId,
      clienteExternoId: comando.clienteExternoId ?? null,
      contratoExternoId: comando.contratoExternoId ?? null,
      iniciadoEm: comando.iniciadoEm.toISOString(),
    });
    return createHash('sha256').update(canonico, 'utf8').digest('hex');
  }
}
