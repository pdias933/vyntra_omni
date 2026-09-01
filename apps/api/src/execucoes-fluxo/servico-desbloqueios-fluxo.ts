import { createHash } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  ADAPTADOR_ERP,
  type AdaptadorErp,
} from '../erp/adaptador-erp.js';
import type { NoDefinicaoFluxo } from '../fluxos/modelo-validacao-fluxo.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from '../desbloqueios-confianca/servico-elegibilidade-desbloqueio-confianca.js';
import { ServicoExecucaoDesbloqueioConfianca } from '../desbloqueios-confianca/servico-execucao-desbloqueio-confianca.js';
import type { AtorFluxoDesbloqueioConfianca } from '../desbloqueios-confianca/modelo-desbloqueio-confianca.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';

export type TipoNoDesbloqueioFluxo =
  | 'EXECUTAR_DESBLOQUEIO_CONFIANCA'
  | 'VERIFICAR_DESBLOQUEIO_CONFIANCA';

export type PreparacaoNoDesbloqueioFluxo =
  | {
      readonly codigo: string;
      readonly resultado: 'FALHA';
      readonly tipo: TipoNoDesbloqueioFluxo;
    }
  | {
      readonly ator: AtorFluxoDesbloqueioConfianca;
      readonly atendimentoId: string;
      readonly contratoExternoId: string;
      readonly resultado: 'PRONTA';
      readonly tipo: 'VERIFICAR_DESBLOQUEIO_CONFIANCA';
    }
  | {
      readonly ator: AtorFluxoDesbloqueioConfianca;
      readonly atendimentoId: string;
      readonly chaveIdempotencia: string;
      readonly contratoExternoId: string;
      readonly resultado: 'PRONTA';
      readonly tipo: 'EXECUTAR_DESBLOQUEIO_CONFIANCA';
    };

export type ResultadoNoDesbloqueioFluxo =
  | { readonly codigo: string; readonly resultado: 'FALHA' }
  | {
      readonly resultado:
        | 'CONCLUIDO'
        | 'ELEGIVEL'
        | 'INDISPONIVEL'
        | 'NAO_ELEGIVEL'
        | 'RESULTADO_INCERTO';
    };

@Injectable()
export class ServicoDesbloqueiosFluxo {
  public constructor(
    @Inject(ServicoElegibilidadeDesbloqueioConfianca)
    private readonly elegibilidade: ServicoElegibilidadeDesbloqueioConfianca,
    @Inject(ServicoExecucaoDesbloqueioConfianca)
    private readonly execucao: ServicoExecucaoDesbloqueioConfianca,
    @Optional()
    @Inject(ADAPTADOR_ERP)
    private readonly adaptador?: AdaptadorErp,
  ) {}

  public async preparar(
    no: NoDefinicaoFluxo & { readonly tipo: TipoNoDesbloqueioFluxo },
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoDesbloqueioFluxo> {
    if (!this.configuracaoValida(no)) {
      return {
        codigo: 'CONFIGURACAO_DESBLOQUEIO_INVALIDA',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    const atendimento = await transacao.atendimento.findUnique({
      select: {
        contexto: { select: { contratoExternoAtivoId: true } },
        estado: true,
        filaAtualId: true,
        modo: true,
        usuarioResponsavelId: true,
      },
      where: { id: execucao.atendimentoId },
    });
    if (
      atendimento?.contexto?.contratoExternoAtivoId === null ||
      atendimento?.contexto === null ||
      atendimento?.estado !== 'AGUARDANDO' ||
      atendimento.filaAtualId !== null ||
      atendimento.modo !== 'BOT' ||
      atendimento.usuarioResponsavelId !== null
    ) {
      return {
        codigo: 'CONTEXTO_DESBLOQUEIO_INDISPONIVEL',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    const comum = {
      ator: {
        fluxoId: execucao.fluxoId,
        versaoFluxoId: execucao.versaoFluxoId,
      },
      atendimentoId: execucao.atendimentoId,
      contratoExternoId: atendimento.contexto.contratoExternoAtivoId,
      resultado: 'PRONTA' as const,
    };
    return no.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA'
      ? { ...comum, tipo: no.tipo }
      : {
          ...comum,
          chaveIdempotencia: this.uuidEstavel(execucao.id, no.id),
          tipo: no.tipo,
        };
  }

  public async executar(
    preparacao: PreparacaoNoDesbloqueioFluxo,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoNoDesbloqueioFluxo> {
    if (preparacao.resultado === 'FALHA') {
      return { codigo: preparacao.codigo, resultado: 'FALHA' };
    }
    if (this.adaptador === undefined) {
      return preparacao.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA'
        ? { resultado: 'INDISPONIVEL' }
        : {
            codigo: 'INTEGRACAO_ERP_INDISPONIVEL',
            resultado: 'FALHA',
          };
    }
    try {
      return preparacao.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA'
        ? await this.verificar(preparacao, relogio)
        : await this.executarConfirmado(preparacao);
    } catch {
      return { codigo: 'OPERACAO_DESBLOQUEIO_FALHOU', resultado: 'FALHA' };
    }
  }

  private async verificar(
    preparacao: Extract<
      PreparacaoNoDesbloqueioFluxo,
      {
        readonly resultado: 'PRONTA';
        readonly tipo: 'VERIFICAR_DESBLOQUEIO_CONFIANCA';
      }
    >,
    relogio: () => Date,
  ): Promise<ResultadoNoDesbloqueioFluxo> {
    const resultado = await this.elegibilidade.verificarParaFluxo(
      preparacao.ator,
      {
        atendimentoId: preparacao.atendimentoId,
        contratoExternoId: preparacao.contratoExternoId,
      },
      this.adaptador as AdaptadorErp,
      relogio,
    );
    if (resultado.resultado === 'INDISPONIVEL') {
      return { resultado: 'INDISPONIVEL' };
    }
    if (resultado.resultado === 'NAO_ENCONTRADO' || !resultado.elegivel) {
      return { resultado: 'NAO_ELEGIVEL' };
    }
    return { resultado: 'ELEGIVEL' };
  }

  private async executarConfirmado(
    preparacao: Extract<
      PreparacaoNoDesbloqueioFluxo,
      {
        readonly resultado: 'PRONTA';
        readonly tipo: 'EXECUTAR_DESBLOQUEIO_CONFIANCA';
      }
    >,
  ): Promise<ResultadoNoDesbloqueioFluxo> {
    const entrada = {
      atendimentoId: preparacao.atendimentoId,
      chaveIdempotencia: preparacao.chaveIdempotencia,
      confirmacaoExplicita: true as const,
      contratoExternoId: preparacao.contratoExternoId,
      proximaAcaoEm: new Date(Date.now() + 60_000),
    };
    let resultado = await this.execucao.executar(
      preparacao.ator,
      entrada,
      this.adaptador as AdaptadorErp,
    );
    if (resultado.situacao === 'RECONCILIACAO_NECESSARIA') {
      resultado = await this.execucao.reconciliar(
        preparacao.ator,
        entrada,
        this.adaptador as AdaptadorErp,
      );
    }
    if (resultado.situacao === 'CONCLUIDO') {
      return { resultado: 'CONCLUIDO' };
    }
    if (
      resultado.situacao === 'INELEGIVEL' ||
      resultado.situacao === 'DESBLOQUEIO_CONCORRENTE'
    ) {
      return { resultado: 'NAO_ELEGIVEL' };
    }
    if (
      resultado.situacao === 'PROCESSAMENTO_EM_CURSO' ||
      resultado.situacao === 'RECONCILIACAO_NECESSARIA'
    ) {
      return { resultado: 'RESULTADO_INCERTO' };
    }
    return { codigo: 'EXECUCAO_DESBLOQUEIO_FALHOU', resultado: 'FALHA' };
  }

  private configuracaoValida(
    no: NoDefinicaoFluxo & { readonly tipo: TipoNoDesbloqueioFluxo },
  ): boolean {
    if (
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return false;
    }
    if (no.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA') {
      return Object.keys(no.parametros).length === 0;
    }
    return (
      Object.keys(no.parametros).length === 1 &&
      Reflect.get(no.parametros, 'confirmacaoExplicita') === true
    );
  }

  private uuidEstavel(execucaoId: string, noId: string): string {
    const hexadecimal = createHash('sha256')
      .update(`desbloqueio-fluxo:${execucaoId}:${noId}`, 'utf8')
      .digest('hex');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-4${hexadecimal.slice(13, 16)}-8${hexadecimal.slice(17, 20)}-${hexadecimal.slice(20, 32)}`;
  }
}
