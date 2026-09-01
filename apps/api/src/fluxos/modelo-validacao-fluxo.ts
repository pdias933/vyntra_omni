export const TIPOS_NO_FLUXO = [
  'INICIO',
  'FIM',
  'ENVIAR_MENSAGEM',
  'ENVIAR_BOTOES_OU_LISTA',
  'CONDICAO',
  'DEFINIR_VARIAVEL',
  'AGUARDAR',
  'HORARIO_ATENDIMENTO',
  'IDENTIFICAR_CONTATO',
  'SOLICITAR_DADOS_CONTATO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'SELECIONAR_CLIENTE',
  'SELECIONAR_CONTRATO',
  'CONSULTAR_FATURAS',
  'ENVIAR_FATURA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'CONSULTAR_SESSAO_ACESSO',
  'CRIAR_ATENDIMENTO',
  'CRIAR_ORDEM_SERVICO',
  'TRANSFERIR_PARA_FILA',
  'AGUARDAR_ATENDENTE',
  'ENCERRAR_ATENDIMENTO',
] as const;

export const TIPOS_VARIAVEL_FLUXO = [
  'BOOLEANO',
  'DATA_HORA',
  'DECIMAL',
  'INTEIRO',
  'TEXTO',
  'UUID',
] as const;

export const TIPOS_REFERENCIA_FLUXO = [
  'CALENDARIO',
  'FILA',
  'FORMULARIO_WHATSAPP',
  'MODELO_MENSAGEM',
] as const;

export type TipoNoFluxo = (typeof TIPOS_NO_FLUXO)[number];
export type TipoVariavelFluxo = (typeof TIPOS_VARIAVEL_FLUXO)[number];
export type TipoReferenciaFluxo = (typeof TIPOS_REFERENCIA_FLUXO)[number];

export interface VariavelDefinicaoFluxo {
  readonly nome: string;
  readonly tipo: TipoVariavelFluxo;
  readonly sensivel: boolean;
  readonly disponivelNaEntrada: boolean;
}

export interface ReferenciaNoFluxo {
  readonly tipo: TipoReferenciaFluxo;
  readonly recursoId: string;
}

export interface NoDefinicaoFluxo {
  readonly id: string;
  readonly tipo: TipoNoFluxo;
  readonly variaveisEntrada: readonly string[];
  readonly variaveisSaida: readonly string[];
  readonly referencias: readonly ReferenciaNoFluxo[];
  readonly limiteIteracoes?: number;
  readonly parametros: Readonly<Record<string, unknown>>;
}

export interface ConexaoDefinicaoFluxo {
  readonly origemNoId: string;
  readonly saida: string;
  readonly destinoNoId: string;
}

export interface DefinicaoFluxoV1 {
  readonly versaoSchema: 1;
  readonly inicioNoId: string;
  readonly variaveis: readonly VariavelDefinicaoFluxo[];
  readonly nos: readonly NoDefinicaoFluxo[];
  readonly conexoes: readonly ConexaoDefinicaoFluxo[];
}

export interface ReferenciaAtivaFluxo {
  readonly tipo: TipoReferenciaFluxo;
  readonly recursoId: string;
}

export interface ContextoValidacaoPublicacaoFluxo {
  readonly capacidadesHabilitadas: readonly TipoNoFluxo[];
  readonly referenciasAtivas: readonly ReferenciaAtivaFluxo[];
}

export interface ProblemaValidacaoFluxo {
  readonly codigo: string;
  readonly noId?: string;
  readonly referenciaId?: string;
  readonly variavel?: string;
}

export interface RelatorioValidacaoFluxo {
  readonly valido: boolean;
  readonly quantidadeNos: number;
  readonly quantidadeConexoes: number;
  readonly problemas: readonly ProblemaValidacaoFluxo[];
}

export interface EntradaPreparacaoPublicacaoFluxo {
  readonly versaoFluxoId: unknown;
  readonly revisaoVersaoEsperada: unknown;
}

export interface ResultadoPreparacaoPublicacaoFluxo {
  readonly fluxoId: string;
  readonly versaoFluxoId: string;
  readonly revisaoVersao: number;
  readonly estado: 'EM_TESTE';
  readonly relatorio: RelatorioValidacaoFluxo;
}
