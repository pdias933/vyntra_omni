import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export interface NotaInternaPersistida {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly filaId: string;
  readonly autorUsuarioId: string;
  readonly visibilidade: 'SOMENTE_EQUIPE';
  readonly conteudoProtegido: ObjetoJsonProtegido;
  readonly criadaEm: Date;
}
