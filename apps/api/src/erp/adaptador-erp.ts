import type {
  ClienteErpNormalizado,
  ComandoAtualizarOrdemServicoErp,
  ComandoCriarOrdemServicoErp,
  ComandoExecutarDesbloqueioConfiancaErp,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarDesbloqueioConfiancaErp,
  ComandoReconciliarAtualizacaoOrdemServicoErp,
  ComandoReconciliarCriacaoOrdemServicoErp,
  ComandoReconciliarAtendimentoErp,
  ContratoErpNormalizado,
  CriteriosLocalizacaoClienteErp,
  FaturaErpNormalizada,
  DadosPagamentoFaturaErpNormalizados,
  DocumentoFaturaErpNormalizado,
  ResultadoElegibilidadeDesbloqueioErp,
  ResultadoComplementoFaturaErp,
  ResultadoConsultaErp,
  ResultadoConsultaUnicaErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoCriacaoOrdemServicoErp,
  ResultadoAtualizacaoOrdemServicoErp,
  ResultadoExecucaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoAtualizacaoOrdemServicoErp,
  ResultadoReconciliacaoCriacaoOrdemServicoErp,
  ResultadoReconciliacaoAtendimentoErp,
} from './modelo-erp.js';

export const ADAPTADOR_ERP = Symbol('ADAPTADOR_ERP');

export interface ConsultasErp {
  localizarClientes(
    criterios: CriteriosLocalizacaoClienteErp,
  ): Promise<ResultadoConsultaErp<ClienteErpNormalizado>>;

  consultarCliente(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ClienteErpNormalizado>>;

  listarContratos(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ContratoErpNormalizado>>;

  consultarContrato(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ContratoErpNormalizado>>;

  listarFaturas(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaErp<FaturaErpNormalizada>>;

  consultarFatura(
    faturaExternaId: string,
  ): Promise<ResultadoConsultaUnicaErp<FaturaErpNormalizada>>;

  obterDocumentoFatura(
    faturaExternaId: string,
  ): Promise<ResultadoComplementoFaturaErp<DocumentoFaturaErpNormalizado>>;

  obterDadosPagamentoFatura(
    faturaExternaId: string,
  ): Promise<
    ResultadoComplementoFaturaErp<DadosPagamentoFaturaErpNormalizados>
  >;

  verificarElegibilidadeDesbloqueio(
    contratoExternoId: string,
  ): Promise<ResultadoElegibilidadeDesbloqueioErp>;
}

export interface EscritasErp {
  criarAtendimento(
    comando: ComandoCriarAtendimentoErp,
  ): Promise<ResultadoCriacaoAtendimentoErp>;

  reconciliarCriacaoAtendimento(
    comando: ComandoReconciliarAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAtendimentoErp>;

  executarDesbloqueioConfianca(
    comando: ComandoExecutarDesbloqueioConfiancaErp,
  ): Promise<ResultadoExecucaoDesbloqueioConfiancaErp>;

  reconciliarDesbloqueioConfianca(
    comando: ComandoReconciliarDesbloqueioConfiancaErp,
  ): Promise<ResultadoReconciliacaoDesbloqueioConfiancaErp>;

  criarOrdemServico(
    comando: ComandoCriarOrdemServicoErp,
  ): Promise<ResultadoCriacaoOrdemServicoErp>;

  reconciliarCriacaoOrdemServico(
    comando: ComandoReconciliarCriacaoOrdemServicoErp,
  ): Promise<ResultadoReconciliacaoCriacaoOrdemServicoErp>;

  atualizarOrdemServico(
    comando: ComandoAtualizarOrdemServicoErp,
  ): Promise<ResultadoAtualizacaoOrdemServicoErp>;

  reconciliarAtualizacaoOrdemServico(
    comando: ComandoReconciliarAtualizacaoOrdemServicoErp,
  ): Promise<ResultadoReconciliacaoAtualizacaoOrdemServicoErp>;
}

export interface AdaptadorErp extends ConsultasErp, EscritasErp {}
