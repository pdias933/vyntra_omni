import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export const CODIGOS_PERMISSAO = [
  'VISUALIZAR_FILA',
  'RESGATAR_ATENDIMENTO',
  'TRANSFERIR_ATENDIMENTO',
  'RECEBER_TRANSFERENCIA',
  'ENCERRAR_ATENDIMENTO',
  'REABRIR_ATENDIMENTO',
  'ASSUMIR_ATENDIMENTO',
  'ADICIONAR_NOTA_INTERNA',
  'VISUALIZAR_NOTA_INTERNA',
  'CONSULTAR_CLIENTE',
  'VINCULAR_CLIENTE',
  'ALTERAR_CONTEXTO_CLIENTE',
  'CONSULTAR_CONTRATO',
  'CONSULTAR_FINANCEIRO',
  'ENVIAR_FATURA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'CONSULTAR_SESSAO_ACESSO',
  'DESCONECTAR_SESSAO_ACESSO',
  'CRIAR_ORDEM_SERVICO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'VISUALIZAR_FLUXO',
  'EDITAR_FLUXO',
  'TESTAR_FLUXO',
  'PUBLICAR_FLUXO',
  'REVERTER_FLUXO',
  'VISUALIZAR_HISTORICO_TRANSVERSAL',
  'VISUALIZAR_NOTAS_TRANSVERSAIS',
  'VISUALIZAR_DADO_SENSIVEL',
  'EXPORTAR_HISTORICO',
  'ADMINISTRAR_USUARIOS',
  'ADMINISTRAR_FILAS',
  'ADMINISTRAR_INTEGRACOES',
  'ADMINISTRAR_RELEASES',
] as const;

export type CodigoPermissaoAutorizacao = (typeof CODIGOS_PERMISSAO)[number];
export type PapelBaseAutorizacao =
  | 'ADMINISTRADOR'
  | 'ATENDENTE'
  | 'SUPERVISOR';
export type EfeitoPermissaoAutorizacao = 'CONCEDER' | 'NEGAR';

export interface ContextoSessaoAutorizacao {
  readonly sessaoId: string;
  readonly usuarioId: string;
  readonly estado: 'ATIVA' | 'REVOGADA';
  readonly expiraEm: Date;
}

export interface RecursoAutorizavel {
  readonly tipo: string;
  readonly id: string;
}

export interface EntradaAutorizacao {
  readonly sessao: ContextoSessaoAutorizacao;
  readonly permissao: CodigoPermissaoAutorizacao;
  readonly filaId?: string;
  readonly recurso: RecursoAutorizavel;
}

export interface AjustePermissaoAutorizacao {
  readonly codigo: CodigoPermissaoAutorizacao;
  readonly efeito: EfeitoPermissaoAutorizacao;
}

export interface ContextoUsuarioAutorizacao {
  readonly usuarioAtivo: boolean;
  readonly perfilAtivo: boolean;
  readonly papelBase: PapelBaseAutorizacao | undefined;
  readonly ajustes: readonly AjustePermissaoAutorizacao[];
  readonly filaAtiva: boolean;
  readonly acessoFilaAtivo: boolean;
}

export interface AutorizacaoConcedida {
  readonly usuarioId: string;
  readonly sessaoId: string;
  readonly papelBase: PapelBaseAutorizacao;
  readonly permissao: CodigoPermissaoAutorizacao;
  readonly filaId?: string;
  readonly recurso: RecursoAutorizavel;
}

export interface ResultadoVerificacaoRecurso {
  readonly acessivel: boolean;
  readonly estadoPermiteAcao: boolean;
}

export type VerificadorRecursoAutorizavel = (
  autorizacao: AutorizacaoConcedida,
  transacao?: TransacaoPrisma,
) => Promise<ResultadoVerificacaoRecurso>;
