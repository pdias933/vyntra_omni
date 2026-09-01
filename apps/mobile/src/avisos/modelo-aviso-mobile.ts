export type TipoAvisoMobile =
  | 'CLIENTE_AGUARDANDO'
  | 'JANELA_EXPIRANDO'
  | 'NOVA_MENSAGEM'
  | 'NOVO_PENDENTE'
  | 'TRANSFERENCIA_DIRETA';

export interface AvisoMobileRecebido {
  readonly atendimentoId?: string;
  readonly chaveAgrupamento: string;
  readonly conversaId?: string;
  readonly sequenciaObservada: string;
  readonly tipo: TipoAvisoMobile;
}
