export const MARCOS_ALERTA_JANELA_CANAL = [
  'UMA_HORA',
  'TRINTA_MINUTOS',
  'DEZ_MINUTOS',
] as const;

export type MarcoAlertaJanelaCanal =
  (typeof MARCOS_ALERTA_JANELA_CANAL)[number];
export type EstadoJanelaCanal = 'AUSENTE' | 'ABERTA' | 'EXPIRADA';
export type TipoSaidaCanal = 'TEXTO_LIVRE' | 'MODELO_APROVADO';

export interface JanelaCanalPersistida {
  readonly id: string;
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly ultimaEntradaContatoEm: Date;
  readonly expiraEm: Date;
  readonly versao: number;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;
}

export interface AlertaJanelaCanalEmitido {
  readonly id: string;
  readonly janelaCanalId: string;
  readonly versaoJanela: number;
  readonly marco: MarcoAlertaJanelaCanal;
  readonly previstoEm: Date;
  readonly emitidoEm: Date;
}

export interface ResultadoEstadoJanelaCanal {
  readonly estado: EstadoJanelaCanal;
  readonly expiraEm?: Date | undefined;
  readonly versao?: number | undefined;
}

export interface ResultadoAutorizacaoSaidaCanal
  extends ResultadoEstadoJanelaCanal {
  readonly tipo: TipoSaidaCanal;
  readonly permitida: true;
}
