export interface PainelAdministracaoOperacional {
  readonly capacidades: { readonly administrarCalendarios: boolean; readonly administrarFilas: boolean; readonly administrarIntegracoes: boolean };
  readonly contas: readonly { readonly id: string; readonly nome: string; readonly estado: string; readonly telefoneMascarado?: string; readonly versao: number }[];
  readonly filas: readonly { readonly id: string; readonly nome: string; readonly estado: string; readonly usuariosAtivos: number; readonly atendimentosAbertos: number; readonly calendario?: string; readonly sla?: { readonly atendenteMinutos: number; readonly supervisorMinutos: number; readonly administradorMinutos: number; readonly versao: number } }[];
  readonly calendarios: readonly { readonly id: string; readonly nome: string; readonly fusoHorario: string; readonly modo: string; readonly overrideAtual?: { readonly estado: string; readonly vigenteAte: Date } }[];
  readonly integracoes: readonly { readonly codigo: 'CANAL_WHATSAPP' | 'POSTGRESQL' | 'SESSAO_ACESSO' | 'SISTEMA_GESTAO'; readonly estado: 'ATIVA' | 'NAO_CONFIGURADA'; readonly detalhe: string }[];
}
