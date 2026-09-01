import { createHash } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  ADAPTADOR_ERP,
  type EscritasErp,
} from '../erp/adaptador-erp.js';
import type { NoDefinicaoFluxo } from '../fluxos/modelo-validacao-fluxo.js';
import type { AtorFluxoOrdemServicoErp } from '../ordens-servico/modelo-ordem-servico.js';
import { ServicoOrdensServicoErp } from '../ordens-servico/servico-ordens-servico.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ServicoCriacaoProtocoloErp } from '../protocolos-erp/servico-criacao-protocolo-erp.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';

export type TipoNoProtocoloOrdemFluxo =
  | 'CRIAR_ATENDIMENTO'
  | 'CRIAR_ORDEM_SERVICO';

export type PreparacaoNoProtocoloOrdemFluxo =
  | {
      readonly codigo: string;
      readonly resultado: 'FALHA';
      readonly tipo: TipoNoProtocoloOrdemFluxo;
    }
  | {
      readonly resultado: 'JA_CONCLUIDA';
      readonly tipo: 'CRIAR_ATENDIMENTO';
    }
  | {
      readonly atendimentoId: string;
      readonly assunto: string;
      readonly chaveIdempotencia: string;
      readonly iniciadoEm: Date;
      readonly resultado: 'PRONTA';
      readonly tipo: 'CRIAR_ATENDIMENTO';
    }
  | {
      readonly ator: AtorFluxoOrdemServicoErp;
      readonly atendimentoId: string;
      readonly assunto: string;
      readonly chaveIdempotencia: string;
      readonly clienteExternoId: string;
      readonly contratoExternoId: string;
      readonly descricao: string;
      readonly protocoloOficial: string;
      readonly resultado: 'PRONTA';
      readonly tipo: 'CRIAR_ORDEM_SERVICO';
    };

export type ResultadoNoProtocoloOrdemFluxo =
  | { readonly codigo: string; readonly resultado: 'FALHA' }
  | { readonly resultado: 'INDISPONIVEL' }
  | { readonly resultado: 'RESULTADO_INCERTO' }
  | { readonly resultado: 'CRIADO' | 'CRIADA' };

@Injectable()
export class ServicoProtocolosOrdensFluxo {
  public constructor(
    @Inject(ServicoCriacaoProtocoloErp)
    private readonly protocolos: ServicoCriacaoProtocoloErp,
    @Inject(ServicoOrdensServicoErp)
    private readonly ordens: ServicoOrdensServicoErp,
    @Optional()
    @Inject(ADAPTADOR_ERP)
    private readonly escritas?: EscritasErp,
  ) {}

  public async preparar(
    no: NoDefinicaoFluxo & { readonly tipo: TipoNoProtocoloOrdemFluxo },
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoProtocoloOrdemFluxo> {
    if (!this.configuracaoValida(no)) {
      return {
        codigo: 'CONFIGURACAO_OPERACAO_ERP_INVALIDA',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    const atendimento = await transacao.atendimento.findUnique({
      select: {
        contexto: {
          select: {
            clienteExternoAtivoId: true,
            contratoExternoAtivoId: true,
          },
        },
        iniciadoEm: true,
        protocoloErp: {
          select: { estado: true, protocoloOficial: true },
        },
      },
      where: { id: execucao.atendimentoId },
    });
    if (atendimento === null) {
      return {
        codigo: 'ATENDIMENTO_INDISPONIVEL',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    if (no.tipo === 'CRIAR_ATENDIMENTO') {
      if (
        atendimento.protocoloErp?.estado === 'OFICIAL' &&
        atendimento.protocoloErp.protocoloOficial !== null
      ) {
        return { resultado: 'JA_CONCLUIDA', tipo: no.tipo };
      }
      return {
        atendimentoId: execucao.atendimentoId,
        assunto: 'Atendimento omnichannel',
        chaveIdempotencia: this.uuidEstavel(execucao.id, no.id),
        iniciadoEm: atendimento.iniciadoEm,
        resultado: 'PRONTA',
        tipo: no.tipo,
      };
    }
    const assunto = Reflect.get(no.parametros, 'assunto');
    const descricao = Reflect.get(no.parametros, 'descricao');
    if (
      atendimento.contexto === null ||
      atendimento.contexto.contratoExternoAtivoId === null ||
      atendimento.protocoloErp?.estado !== 'OFICIAL' ||
      atendimento.protocoloErp.protocoloOficial === null ||
      typeof assunto !== 'string' ||
      typeof descricao !== 'string'
    ) {
      return {
        codigo: 'CONTEXTO_ORDEM_SERVICO_INDISPONIVEL',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    return {
      ator: {
        fluxoId: execucao.fluxoId,
        versaoFluxoId: execucao.versaoFluxoId,
      },
      atendimentoId: execucao.atendimentoId,
      assunto: assunto.trim(),
      chaveIdempotencia: this.uuidEstavel(execucao.id, no.id),
      clienteExternoId: atendimento.contexto.clienteExternoAtivoId,
      contratoExternoId: atendimento.contexto.contratoExternoAtivoId,
      descricao: descricao.trim(),
      protocoloOficial: atendimento.protocoloErp.protocoloOficial,
      resultado: 'PRONTA',
      tipo: no.tipo,
    };
  }

  public async executar(
    preparacao: PreparacaoNoProtocoloOrdemFluxo,
  ): Promise<ResultadoNoProtocoloOrdemFluxo> {
    if (preparacao.resultado === 'FALHA') {
      return { codigo: preparacao.codigo, resultado: 'FALHA' };
    }
    if (preparacao.resultado === 'JA_CONCLUIDA') {
      return { resultado: 'CRIADO' };
    }
    if (this.escritas === undefined) return { resultado: 'INDISPONIVEL' };
    try {
      return preparacao.tipo === 'CRIAR_ATENDIMENTO'
        ? await this.executarProtocolo(preparacao)
        : await this.executarOrdem(preparacao);
    } catch {
      return { codigo: 'OPERACAO_ERP_FALHOU', resultado: 'FALHA' };
    }
  }

  private async executarProtocolo(
    preparacao: Extract<
      PreparacaoNoProtocoloOrdemFluxo,
      { readonly resultado: 'PRONTA'; readonly tipo: 'CRIAR_ATENDIMENTO' }
    >,
  ): Promise<ResultadoNoProtocoloOrdemFluxo> {
    const entrada = {
      comando: {
        assunto: preparacao.assunto,
        atendimentoId: preparacao.atendimentoId,
        chaveIdempotencia: preparacao.chaveIdempotencia,
        iniciadoEm: preparacao.iniciadoEm,
      },
      proximaAcaoEm: new Date(Date.now() + 60_000),
    };
    let resultado = await this.protocolos.executarCriacao(
      entrada,
      this.escritas as EscritasErp,
    );
    if (resultado.situacao === 'RECONCILIACAO_NECESSARIA') {
      resultado = await this.protocolos.reconciliarCriacao(
        entrada,
        this.escritas as EscritasErp,
      );
    }
    if (resultado.situacao === 'CONCLUIDO') return { resultado: 'CRIADO' };
    if (
      resultado.situacao === 'PROCESSAMENTO_EM_CURSO' ||
      resultado.situacao === 'RECONCILIACAO_NECESSARIA'
    ) {
      return { resultado: 'RESULTADO_INCERTO' };
    }
    if (
      resultado.situacao === 'AGUARDANDO_NOVA_TENTATIVA' ||
      resultado.situacao === 'CRIACAO_NECESSARIA'
    ) {
      return { resultado: 'INDISPONIVEL' };
    }
    return { codigo: 'CRIACAO_PROTOCOLO_FALHOU', resultado: 'FALHA' };
  }

  private async executarOrdem(
    preparacao: Extract<
      PreparacaoNoProtocoloOrdemFluxo,
      { readonly resultado: 'PRONTA'; readonly tipo: 'CRIAR_ORDEM_SERVICO' }
    >,
  ): Promise<ResultadoNoProtocoloOrdemFluxo> {
    const entrada = {
      atendimentoId: preparacao.atendimentoId,
      assunto: preparacao.assunto,
      chaveIdempotencia: preparacao.chaveIdempotencia,
      clienteExternoId: preparacao.clienteExternoId,
      confirmacaoExplicita: true as const,
      contratoExternoId: preparacao.contratoExternoId,
      descricao: preparacao.descricao,
      protocoloOficial: preparacao.protocoloOficial,
      proximaAcaoEm: new Date(Date.now() + 60_000),
    };
    let resultado = await this.ordens.criar(
      preparacao.ator,
      entrada,
      this.escritas as EscritasErp,
    );
    if (resultado.situacao === 'RECONCILIACAO_NECESSARIA') {
      resultado = await this.ordens.reconciliarCriacao(
        preparacao.ator,
        entrada,
        this.escritas as EscritasErp,
      );
    }
    if (resultado.situacao === 'CONCLUIDA') return { resultado: 'CRIADA' };
    if (
      resultado.situacao === 'PROCESSAMENTO_EM_CURSO' ||
      resultado.situacao === 'RECONCILIACAO_NECESSARIA'
    ) {
      return { resultado: 'RESULTADO_INCERTO' };
    }
    if (resultado.situacao === 'AGUARDANDO_NOVA_TENTATIVA') {
      return { resultado: 'INDISPONIVEL' };
    }
    return { codigo: 'CRIACAO_ORDEM_SERVICO_FALHOU', resultado: 'FALHA' };
  }

  private configuracaoValida(
    no: NoDefinicaoFluxo & { readonly tipo: TipoNoProtocoloOrdemFluxo },
  ): boolean {
    if (
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return false;
    }
    if (no.tipo === 'CRIAR_ATENDIMENTO') {
      return Object.keys(no.parametros).length === 0;
    }
    return (
      Object.keys(no.parametros).sort().join(',') ===
        'assunto,confirmacaoExplicita,descricao' &&
      Reflect.get(no.parametros, 'confirmacaoExplicita') === true &&
      this.textoValido(Reflect.get(no.parametros, 'assunto'), 200) &&
      this.textoValido(Reflect.get(no.parametros, 'descricao'), 4_000)
    );
  }

  private textoValido(valor: unknown, limite: number): valor is string {
    return (
      typeof valor === 'string' &&
      valor.trim().length > 0 &&
      valor.length <= limite &&
      !valor.includes('\u0000')
    );
  }

  private uuidEstavel(execucaoId: string, noId: string): string {
    const hexadecimal = createHash('sha256')
      .update(`${execucaoId}:${noId}`, 'utf8')
      .digest('hex')
      .slice(0, 32)
      .split('');
    hexadecimal[12] = '5';
    hexadecimal[16] = ['8', '9', 'a', 'b'][
      Number.parseInt(hexadecimal[16] ?? '0', 16) % 4
    ]!;
    const valor = hexadecimal.join('');
    return `${valor.slice(0, 8)}-${valor.slice(8, 12)}-${valor.slice(12, 16)}-${valor.slice(16, 20)}-${valor.slice(20)}`;
  }
}
