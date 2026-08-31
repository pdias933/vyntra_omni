import type {
  ClienteErpNormalizado,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarAtendimentoErp,
  ContratoErpNormalizado,
  CriteriosLocalizacaoClienteErp,
  FaturaErpNormalizada,
  ResultadoConsultaErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoReconciliacaoAtendimentoErp,
} from './modelo-erp.js';

export const ADAPTADOR_ERP = Symbol('ADAPTADOR_ERP');

export interface ConsultasErp {
  localizarClientes(
    criterios: CriteriosLocalizacaoClienteErp,
  ): Promise<ResultadoConsultaErp<ClienteErpNormalizado>>;

  listarContratos(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ContratoErpNormalizado>>;

  listarFaturas(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaErp<FaturaErpNormalizada>>;
}

export interface EscritasErp {
  criarAtendimento(
    comando: ComandoCriarAtendimentoErp,
  ): Promise<ResultadoCriacaoAtendimentoErp>;

  reconciliarCriacaoAtendimento(
    comando: ComandoReconciliarAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAtendimentoErp>;
}

export interface AdaptadorErp extends ConsultasErp, EscritasErp {}
