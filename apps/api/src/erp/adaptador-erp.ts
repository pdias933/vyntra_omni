import type {
  ClienteErpNormalizado,
  ComandoExecutarDesbloqueioConfiancaErp,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarDesbloqueioConfiancaErp,
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
  ResultadoExecucaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoDesbloqueioConfiancaErp,
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
}

export interface AdaptadorErp extends ConsultasErp, EscritasErp {}
