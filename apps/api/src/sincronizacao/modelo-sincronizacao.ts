import type { EventoDominio } from '../eventos/modelo-eventos.js';
import type {
  PayloadEventoMobile,
  PayloadEventoWeb,
} from './modelo-projecao-evento.js';
import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export interface LimitesRetencaoEventos {
  readonly menorSequenciaRetida: bigint | undefined;
  readonly maiorSequencia: bigint;
}

export interface EventoVarridoSincronizacao {
  readonly autorizado: boolean;
  readonly evento: EventoDominio;
  readonly podeVerDadoSensivel: boolean;
}

export interface LoteSincronizacaoIncremental {
  readonly eventos: readonly (PayloadEventoMobile | PayloadEventoWeb)[];
  readonly sequenciaFinal: string;
  readonly temMais: boolean;
}

export interface FilaSnapshotSincronizacao {
  readonly id: string;
  readonly nome: string;
}

export interface AtendimentoSnapshotSincronizacao {
  readonly id: string;
  readonly conversaId: string;
  readonly contaOrigemId: string;
  readonly estado: string;
  readonly filaId: string;
  readonly modo: string;
  readonly motivoEspera: string;
  readonly usuarioResponsavelId?: string;
  readonly versaoAtribuicao: number;
  readonly versaoEstado: number;
  readonly atualizadoEm: string;
}

export interface ConversaSnapshotSincronizacao {
  readonly id: string;
  readonly contatoId: string;
  readonly ultimaAtividadeEm: string;
  readonly versao: number;
}

export interface MensagemSnapshotSincronizacao {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly contaOrigemId: string;
  readonly direcao: string;
  readonly tipo: string;
  readonly estadoSaida?: string;
  readonly conteudo: ObjetoJsonProtegido;
  readonly respondeAMensagemId?: string;
  readonly mensagemAlvoReacaoId?: string;
  readonly recebidaServidorEm: string;
  readonly versao: number;
}

export interface NotaInternaSnapshotSincronizacao {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly autorUsuarioId: string;
  readonly conteudo: ObjetoJsonProtegido;
  readonly criadaEm: string;
  readonly visibilidade: 'SOMENTE_EQUIPE';
}

export interface PoliticaVersaoSnapshotSincronizacao {
  readonly plataforma: 'ANDROID' | 'IOS';
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
  readonly versao: number;
}

export interface SnapshotSincronizacaoCompleta {
  readonly sequenciaBase: string;
  readonly geradoEm: string;
  readonly permissoes: readonly string[];
  readonly filas: readonly FilaSnapshotSincronizacao[];
  readonly atendimentos: readonly AtendimentoSnapshotSincronizacao[];
  readonly conversas: readonly ConversaSnapshotSincronizacao[];
  readonly mensagensRecentes: readonly MensagemSnapshotSincronizacao[];
  readonly notasInternasRecentes: readonly NotaInternaSnapshotSincronizacao[];
  readonly controlesRecurso: Readonly<Record<string, boolean>>;
  readonly politicasVersao: readonly PoliticaVersaoSnapshotSincronizacao[];
}
