export type EstadoAtendimento =
  | 'AGUARDANDO'
  | 'EM_ATENDIMENTO'
  | 'ENCERRADO_REABRIVEL'
  | 'ENCERRADO';

export type ModoAtendimento = 'BOT' | 'FILA_HUMANA' | 'HUMANO';

export type MotivoEsperaAtendimento =
  | 'PROCESSANDO_BOT'
  | 'AGUARDANDO_HUMANO'
  | 'FORA_DO_HORARIO'
  | 'AGUARDANDO_CLIENTE'
  | 'NENHUM';

export type OrigemEncerramentoAtendimento = 'USUARIO' | 'FLUXO';

export interface AtendimentoPersistido {
  readonly id: string;
  readonly conversaId: string;
  readonly contaWhatsAppOrigemId: string;
  readonly estado: EstadoAtendimento;
  readonly modo: ModoAtendimento;
  readonly motivoEspera: MotivoEsperaAtendimento;
  readonly filaAtualId?: string | undefined;
  readonly usuarioResponsavelId?: string | undefined;
  readonly versaoEstado: number;
  readonly versaoAtribuicao: number;
  readonly iniciadoEm: Date;
  readonly atualizadoEm: Date;
  readonly encerradoEm?: Date | undefined;
  readonly encerradoPorTipo?: OrigemEncerramentoAtendimento | undefined;
  readonly encerradoPorId?: string | undefined;
  readonly motivoEncerramento?: string | undefined;
  readonly podeReabrirAte?: Date | undefined;
  readonly filaFallbackReaberturaId?: string | undefined;
  readonly finalizadoDefinitivamenteEm?: Date | undefined;
}

export type ComandoTransicaoAtendimento =
  | {
      readonly tipo: 'ENCAMINHAR_FILA';
      readonly filaId: string;
      readonly motivo?: 'AGUARDANDO_HUMANO' | 'FORA_DO_HORARIO' | undefined;
    }
  | {
      readonly tipo: 'ATRIBUIR_HUMANO';
      readonly filaId: string;
      readonly usuarioId: string;
    }
  | { readonly tipo: 'RETORNAR_FILA'; readonly filaId: string }
  | { readonly tipo: 'TRANSFERIR_FILA'; readonly filaId: string }
  | {
      readonly tipo: 'TRANSFERIR_USUARIO';
      readonly filaId: string;
      readonly usuarioId: string;
    }
  | {
      readonly tipo: 'ALTERAR_MOTIVO_ESPERA';
      readonly motivo: MotivoEsperaAtendimento;
    }
  | {
      readonly tipo: 'ENCERRAR';
      readonly origem: OrigemEncerramentoAtendimento;
      readonly atorId: string;
      readonly motivo: string;
      readonly filaFallbackReaberturaId?: string | undefined;
    }
  | {
      readonly tipo: 'REABRIR_USUARIO';
      readonly filaId: string;
      readonly usuarioId: string;
      readonly janelaCanalAberta: boolean;
    }
  | {
      readonly tipo: 'REABRIR_ENTRADA';
      readonly janelaCanalAberta: boolean;
    }
  | { readonly tipo: 'FINALIZAR_TOLERANCIA' };
