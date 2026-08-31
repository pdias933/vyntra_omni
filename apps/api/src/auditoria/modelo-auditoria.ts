export const ORIGENS_AUDITORIA = [
  'USUARIO',
  'FLUXO',
  'SISTEMA',
  'INTEGRACAO',
] as const;

export type OrigemAuditoria = (typeof ORIGENS_AUDITORIA)[number];

export type ValorJsonAuditoria =
  | boolean
  | number
  | ObjetoJsonAuditoria
  | string
  | ValorJsonAuditoria[]
  | null;

export interface ObjetoJsonAuditoria {
  [chave: string]: ValorJsonAuditoria;
}

export interface RegistroAuditoria {
  readonly id: string;
  readonly tipoEvento: string;
  readonly origem: OrigemAuditoria;
  readonly usuarioId: string | undefined;
  readonly fluxoId: string | undefined;
  readonly versaoFluxoId: string | undefined;
  readonly atendimentoId: string | undefined;
  readonly contatoId: string | undefined;
  readonly filaId: string | undefined;
  readonly acao: string;
  readonly entidadeTipo: string | undefined;
  readonly entidadeId: string | undefined;
  readonly dadosAnterioresSanitizados: ObjetoJsonAuditoria | undefined;
  readonly dadosNovosSanitizados: ObjetoJsonAuditoria | undefined;
  readonly enderecoIp: string | undefined;
  readonly dispositivoId: string | undefined;
  readonly sessaoId: string | undefined;
  readonly correlacaoId: string;
  readonly criadoEm: Date;
}

export interface EntradaRegistroAuditoria {
  readonly tipoEvento: string;
  readonly origem: OrigemAuditoria;
  readonly usuarioId?: string;
  readonly fluxoId?: string;
  readonly versaoFluxoId?: string;
  readonly atendimentoId?: string;
  readonly contatoId?: string;
  readonly filaId?: string;
  readonly acao: string;
  readonly entidadeTipo?: string;
  readonly entidadeId?: string;
  readonly dadosAnteriores?: Readonly<Record<string, unknown>>;
  readonly dadosNovos?: Readonly<Record<string, unknown>>;
  readonly enderecoIp?: string;
  readonly dispositivoId?: string;
  readonly sessaoId?: string;
  readonly correlacaoId?: string;
}
