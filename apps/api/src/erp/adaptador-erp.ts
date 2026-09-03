import type {
  ClienteErpNormalizado,
  ComandoAtualizarOrdemServicoErp,
  ComandoAdicionarComentarioAtendimentoErp,
  ComandoCriarOrdemServicoErp,
  ComandoEncerrarAtendimentoErp,
  ComandoExecutarDesbloqueioConfiancaErp,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarDesbloqueioConfiancaErp,
  ComandoReconciliarAtualizacaoOrdemServicoErp,
  ComandoReconciliarComentarioAtendimentoErp,
  ComandoReconciliarCriacaoOrdemServicoErp,
  ComandoReconciliarEncerramentoAtendimentoErp,
  ComandoReconciliarAtendimentoErp,
  ContratoErpNormalizado,
  ConexaoCadastradaErpNormalizada,
  ContextoConsultaContratoErp,
  ContextoConsultaFaturaErp,
  CriteriosLocalizacaoClienteErp,
  FaturaErpNormalizada,
  DadosPagamentoFaturaErpNormalizados,
  DocumentoFaturaErpNormalizado,
  ResultadoElegibilidadeDesbloqueioErp,
  ResultadoComplementoFaturaErp,
  ResultadoConsultaErp,
  ResultadoConsultaFaturasErp,
  ResultadoConsultaUnicaErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoCriacaoOrdemServicoErp,
  ResultadoAtualizacaoOrdemServicoErp,
  ResultadoAcaoAtendimentoErp,
  ResultadoExecucaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoAtualizacaoOrdemServicoErp,
  ResultadoReconciliacaoAcaoAtendimentoErp,
  ResultadoReconciliacaoCriacaoOrdemServicoErp,
  ResultadoReconciliacaoAtendimentoErp,
} from './modelo-erp.js';

export const ADAPTADOR_ERP = Symbol('ADAPTADOR_ERP');
export const CONSULTAS_ERP = Symbol('CONSULTAS_ERP');

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
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaUnicaErp<ContratoErpNormalizado>>;

  listarConexoes(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ConexaoCadastradaErpNormalizada>>;

  listarFaturas(
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaFaturasErp>;

  consultarFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoConsultaUnicaErp<FaturaErpNormalizada>>;

  obterDocumentoFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoComplementoFaturaErp<DocumentoFaturaErpNormalizado>>;

  obterDadosPagamentoFatura(
    contexto: ContextoConsultaFaturaErp,
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

  adicionarComentarioAtendimento(
    comando: ComandoAdicionarComentarioAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp>;

  reconciliarComentarioAtendimento(
    comando: ComandoReconciliarComentarioAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAcaoAtendimentoErp>;

  encerrarAtendimento(
    comando: ComandoEncerrarAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp>;

  reconciliarEncerramentoAtendimento(
    comando: ComandoReconciliarEncerramentoAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAcaoAtendimentoErp>;
}

export interface AdaptadorErp extends ConsultasErp, EscritasErp {}
