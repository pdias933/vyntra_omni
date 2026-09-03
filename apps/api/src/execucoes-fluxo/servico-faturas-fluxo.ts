import { Inject, Injectable, Optional } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import {
  REPOSITORIO_COMPOSICOES_SEGUNDA_VIA,
  type RepositorioComposicoesSegundaVia,
} from '../composicoes/repositorio-composicoes-segunda-via.js';
import {
  CompositorSegundaVia,
  type ComposicaoSegundaVia,
} from '../composicoes/segunda-via.js';
import type { ContextoFinanceiroFluxo } from '../contextos-cliente/modelo-contexto-cliente.js';
import { ServicoContextosCliente } from '../contextos-cliente/servico-contextos-cliente.js';
import {
  ADAPTADOR_ERP,
  type ConsultasErp,
} from '../erp/adaptador-erp.js';
import { ErroConsultaErpInvalida } from '../erp/erros-erp.js';
import { ServicoFinanceiroErp } from '../erp/servico-financeiro-erp.js';
import { ErroRespostaConsultaErpInvalida } from '../erp/servico-consultas-cliente-contrato-erp.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import {
  lerSelecaoFaturaExecucaoFluxo,
  type SelecaoFaturaExecucaoFluxo,
} from './contexto-fatura-execucao-fluxo.js';

export type TipoNoFaturaFluxo = 'CONSULTAR_FATURAS' | 'ENVIAR_FATURA';

export type PreparacaoNoFaturaFluxo =
  | {
      readonly codigo: string;
      readonly resultado: 'FALHA';
      readonly tipo: TipoNoFaturaFluxo;
    }
  | {
      readonly contexto: ContextoFinanceiroFluxo;
      readonly resultado: 'PRONTA';
      readonly tipo: 'CONSULTAR_FATURAS';
    }
  | {
      readonly contexto: ContextoFinanceiroFluxo;
      readonly resultado: 'PRONTA';
      readonly selecao: SelecaoFaturaExecucaoFluxo;
      readonly tipo: 'ENVIAR_FATURA';
    };

export type ResultadoNoFaturaFluxo =
  | {
      readonly codigo: string;
      readonly resultado: 'FALHA';
    }
  | { readonly resultado: 'ERP_INDISPONIVEL' }
  | { readonly resultado: 'NAO_ENCONTRADA' }
  | {
      readonly resultado: 'ENCONTRADA';
      readonly selecao: SelecaoFaturaExecucaoFluxo;
    }
  | {
      readonly composicao: ComposicaoSegundaVia;
      readonly resultado: 'SUCESSO' | 'DADOS_INCOMPLETOS';
    };

@Injectable()
export class ServicoFaturasFluxo {
  private readonly compositor = new CompositorSegundaVia();

  public constructor(
    @Inject(ServicoContextosCliente)
    private readonly contextos: ServicoContextosCliente,
    @Inject(REPOSITORIO_COMPOSICOES_SEGUNDA_VIA)
    private readonly repositorioComposicoes: RepositorioComposicoesSegundaVia,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Optional()
    @Inject(ADAPTADOR_ERP)
    private readonly consultas?: ConsultasErp,
  ) {}

  public async preparar(
    tipo: TipoNoFaturaFluxo,
    atendimentoId: string,
    contextoExecucao: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoFaturaFluxo> {
    const contexto = await this.contextos.obterContextoFinanceiroParaFluxo(
      atendimentoId,
      transacao,
    );
    if (contexto === undefined) {
      return {
        codigo: 'CONTEXTO_FINANCEIRO_INDISPONIVEL',
        resultado: 'FALHA',
        tipo,
      };
    }
    if (tipo === 'CONSULTAR_FATURAS') {
      return { contexto, resultado: 'PRONTA', tipo };
    }
    const selecao = lerSelecaoFaturaExecucaoFluxo(contextoExecucao);
    if (
      selecao === undefined ||
      selecao.contextoAtendimentoVersao !== contexto.versao ||
      selecao.contratoExternoId !== contexto.contratoExternoId
    ) {
      return {
        codigo: 'FATURA_NAO_SELECIONADA',
        resultado: 'FALHA',
        tipo,
      };
    }
    return { contexto, resultado: 'PRONTA', selecao, tipo };
  }

  public async executar(
    preparacao: PreparacaoNoFaturaFluxo,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoNoFaturaFluxo> {
    if (preparacao.resultado === 'FALHA') {
      return { codigo: preparacao.codigo, resultado: 'FALHA' };
    }
    if (this.consultas === undefined) {
      return { resultado: 'ERP_INDISPONIVEL' };
    }
    try {
      return preparacao.tipo === 'CONSULTAR_FATURAS'
        ? await this.consultarFaturas(preparacao)
        : await this.comporFatura(preparacao, relogio);
    } catch (erro) {
      if (
        erro instanceof ErroRespostaConsultaErpInvalida ||
        erro instanceof ErroConsultaErpInvalida
      ) {
        return { codigo: 'RESPOSTA_ERP_INVALIDA', resultado: 'FALHA' };
      }
      return { codigo: 'CONSULTA_ERP_FALHOU', resultado: 'FALHA' };
    }
  }

  public async contextoPermaneceValido(
    preparacao: PreparacaoNoFaturaFluxo,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    if (preparacao.resultado === 'FALHA') return true;
    const atual = await this.contextos.obterContextoFinanceiroParaFluxo(
      preparacao.contexto.atendimentoId,
      transacao,
    );
    return (
      atual !== undefined &&
      atual.atendimentoId === preparacao.contexto.atendimentoId &&
      atual.clienteExternoId === preparacao.contexto.clienteExternoId &&
      atual.contaWhatsAppId === preparacao.contexto.contaWhatsAppId &&
      atual.contatoId === preparacao.contexto.contatoId &&
      atual.contratoExternoId === preparacao.contexto.contratoExternoId &&
      atual.versao === preparacao.contexto.versao
    );
  }

  public async registrarComposicao(
    entrada: {
      readonly atendimentoId: string;
      readonly composicao: ComposicaoSegundaVia;
      readonly fluxoId: string;
      readonly versaoFluxoId: string;
    },
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.repositorioComposicoes.acrescentar(
      entrada.composicao,
      transacao,
    );
    await this.auditoria.registrar(
      {
        acao: 'COMPOR_SEGUNDA_VIA_POR_FLUXO',
        atendimentoId: entrada.atendimentoId,
        contatoId: entrada.composicao.contatoId,
        dadosNovos: {
          incluiLinhaDigitavel: entrada.composicao.incluiLinhaDigitavel,
          incluiLinkSeguro: entrada.composicao.incluiLinkSeguro,
          incluiPdf: entrada.composicao.incluiPdf,
          incluiPix: entrada.composicao.incluiPix,
        },
        entidadeId: entrada.composicao.id,
        entidadeTipo: 'COMPOSICAO_SEGUNDA_VIA',
        fluxoId: entrada.fluxoId,
        origem: 'FLUXO',
        tipoEvento: 'SEGUNDA_VIA_COMPOSTA_POR_FLUXO',
        versaoFluxoId: entrada.versaoFluxoId,
      },
      transacao,
    );
  }

  private async consultarFaturas(
    preparacao: Extract<
      PreparacaoNoFaturaFluxo,
      { readonly tipo: 'CONSULTAR_FATURAS'; readonly resultado: 'PRONTA' }
    >,
  ): Promise<ResultadoNoFaturaFluxo> {
    const financeiro = new ServicoFinanceiroErp(this.consultas as ConsultasErp);
    const resposta = await financeiro.listarFaturas(
      {
        clienteExternoId: preparacao.contexto.clienteExternoId,
        contratoExternoId: preparacao.contexto.contratoExternoId,
      },
    );
    if (resposta.resultado === 'INDISPONIVEL') {
      return { resultado: 'ERP_INDISPONIVEL' };
    }
    if (resposta.cobertura.tipo !== 'INTEGRAL') {
      return {
        codigo: 'COBERTURA_FINANCEIRA_INCOMPLETA',
        resultado: 'FALHA',
      };
    }
    const pagaveis = resposta.itens.filter(
      ({ situacao }) => situacao === 'ABERTA' || situacao === 'VENCIDA',
    );
    if (pagaveis.length === 0) return { resultado: 'NAO_ENCONTRADA' };
    if (pagaveis.length !== 1) {
      return {
        codigo: 'SELECAO_FATURA_NECESSARIA',
        resultado: 'FALHA',
      };
    }
    const fatura = pagaveis[0]!;
    return {
      resultado: 'ENCONTRADA',
      selecao: {
        contextoAtendimentoVersao: preparacao.contexto.versao,
        contratoExternoId: preparacao.contexto.contratoExternoId,
        faturaExternaId: fatura.faturaExternaId,
        situacao: fatura.situacao as 'ABERTA' | 'VENCIDA',
        valorCentavos: fatura.valorCentavos,
        vencimento: fatura.vencimento,
      },
    };
  }

  private async comporFatura(
    preparacao: Extract<
      PreparacaoNoFaturaFluxo,
      { readonly tipo: 'ENVIAR_FATURA'; readonly resultado: 'PRONTA' }
    >,
    relogio: () => Date,
  ): Promise<ResultadoNoFaturaFluxo> {
    const financeiro = new ServicoFinanceiroErp(this.consultas as ConsultasErp);
    const resposta = await financeiro.consultarDetalhesFatura(
      {
        clienteExternoId: preparacao.contexto.clienteExternoId,
        contratoExternoId: preparacao.contexto.contratoExternoId,
        faturaExternaId: preparacao.selecao.faturaExternaId,
      },
    );
    if (resposta.resultado === 'INDISPONIVEL') {
      return { resultado: 'ERP_INDISPONIVEL' };
    }
    if (resposta.resultado === 'NAO_ENCONTRADO') {
      return { codigo: 'FATURA_NAO_ENCONTRADA', resultado: 'FALHA' };
    }
    if (
      resposta.fatura.contratoExternoId !==
        preparacao.contexto.contratoExternoId ||
      resposta.fatura.faturaExternaId !== preparacao.selecao.faturaExternaId ||
      (resposta.fatura.situacao !== 'ABERTA' &&
        resposta.fatura.situacao !== 'VENCIDA')
    ) {
      return { codigo: 'FATURA_NAO_PAGAVEL', resultado: 'FALHA' };
    }
    const pagamento =
      resposta.dadosPagamento.estado === 'DISPONIVEL'
        ? resposta.dadosPagamento.item
        : undefined;
    const composicao = this.compositor.compor(
      {
        contaWhatsAppId: preparacao.contexto.contaWhatsAppId,
        contatoId: preparacao.contexto.contatoId,
        referenciaFatura: resposta.fatura.faturaExternaId,
        valorCentavos: resposta.fatura.valorCentavos,
        vencimento: new Date(`${resposta.fatura.vencimento}T00:00:00.000Z`),
        ...(pagamento?.linhaDigitavel === undefined
          ? {}
          : { linhaDigitavel: pagamento.linhaDigitavel }),
        ...(pagamento?.pixCopiaCola === undefined
          ? {}
          : { pixCopiaCola: pagamento.pixCopiaCola }),
      },
      relogio,
    );
    return {
      composicao,
      resultado:
        resposta.completude === 'COMPLETA' && composicao.incluiPdf
          ? 'SUCESSO'
          : 'DADOS_INCOMPLETOS',
    };
  }
}
