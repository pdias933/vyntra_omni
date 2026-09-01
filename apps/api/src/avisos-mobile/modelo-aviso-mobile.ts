export type TipoAvisoMobile =
  | 'CLIENTE_AGUARDANDO'
  | 'JANELA_EXPIRANDO'
  | 'NOVA_MENSAGEM'
  | 'NOVO_PENDENTE'
  | 'TRANSFERENCIA_DIRETA';

export interface AvisoMobile {
  readonly atendimentoId?: string;
  readonly chaveAgrupamento: string;
  readonly conversaId?: string;
  readonly corpo: string;
  readonly destinatarioDispositivoId: string;
  readonly sequenciaObservada: string;
  readonly tipo: TipoAvisoMobile;
  readonly titulo: string;
}

export type ResultadoEntregaAvisoMobile =
  | { readonly estado: 'ACEITO'; readonly identificadorEntrega: string }
  | { readonly estado: 'DESTINO_INVALIDO' }
  | { readonly estado: 'INDISPONIVEL' };
