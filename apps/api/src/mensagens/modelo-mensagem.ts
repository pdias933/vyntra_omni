import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export const ESTADOS_SAIDA_MENSAGEM = [
  'NA_FILA',
  'ENVIANDO',
  'ENVIADA',
  'ENTREGUE',
  'LIDA',
  'FALHOU',
  'CANCELADA',
] as const;

export type EstadoSaidaMensagemDominio =
  (typeof ESTADOS_SAIDA_MENSAGEM)[number];

export interface MensagemSaidaPersistida {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly contaWhatsAppId: string;
  readonly direcao: 'SAIDA';
  readonly tipo: 'AUDIO' | 'IMAGEM' | 'INTERATIVA' | 'MODELO_APROVADO' | 'PDF' | 'REACAO' | 'TEXTO' | 'VIDEO';
  readonly estadoSaida: EstadoSaidaMensagemDominio;
  readonly conteudoProtegido: ObjetoJsonProtegido;
  readonly conteudoHash: string;
  readonly identificadorExternoMensagem: string | undefined;
  readonly mensagemClienteId: string | undefined;
  readonly usuarioRemetenteId: string | undefined;
  readonly contatoRemetenteId: undefined;
  readonly criadaDispositivoEm: Date | undefined;
  readonly recebidaServidorEm: Date;
  readonly proximaTentativaEm: Date | undefined;
  readonly tentativasEnvio: number;
  readonly enviadaEm: Date | undefined;
  readonly entregueEm: Date | undefined;
  readonly lidaEm: Date | undefined;
  readonly falhouEm: Date | undefined;
  readonly canceladaEm: Date | undefined;
  readonly codigoFalha: string | undefined;
  readonly versao: number;
  readonly execucaoFluxoOrigemId?: string | undefined;
  readonly versaoAtribuicaoOrigem?: number | undefined;
  readonly respondeAMensagemId?: string | undefined;
  readonly mensagemAlvoReacaoId?: string | undefined;
}

export interface ContextoSaidaMensagemAutomatica {
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly conversaId: string;
  readonly versaoAtribuicao: number;
}

export interface MensagemAutomaticaParaDespacho {
  readonly autoridadeValida: boolean;
  readonly mensagem: MensagemSaidaPersistida;
}

export interface OpcaoMensagemAutomatica {
  readonly id: string;
  readonly titulo: string;
  readonly descricao?: string | undefined;
}

export type ResultadoCriacaoMensagemAutomatica =
  | {
      readonly resultado: 'SUCESSO' | 'FALLBACK';
      readonly mensagem: MensagemSaidaPersistida;
    }
  | {
      readonly resultado: 'FALHA_TEMPORARIA' | 'FALHA_DEFINITIVA';
      readonly codigo: string;
    };

export interface ContextoSaidaMensagem {
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly filaId: string;
  readonly janelaExpiraEm: Date | undefined;
  readonly permiteEnvio: boolean;
  readonly versaoAtribuicao: number;
  readonly versaoContexto: number;
  readonly versaoEstado: number;
}

export const MOTIVOS_REVISAO_PENDENCIA_TEXTO = [
  'ATRIBUICAO_ALTERADA',
  'CONTEXTO_ALTERADO',
  'ESTADO_ALTERADO',
  'JANELA_ALTERADA',
  'JANELA_EXPIRADA',
  'TIMELINE_ALTERADA',
] as const;

export type MotivoRevisaoPendenciaTexto =
  (typeof MOTIVOS_REVISAO_PENDENCIA_TEXTO)[number];

export interface ObservacaoPendenciaTexto {
  readonly janelaExpiraEm: Date;
  readonly sequenciaEvento: bigint;
  readonly versaoAtribuicao: number;
  readonly versaoContexto: number;
  readonly versaoEstado: number;
}
