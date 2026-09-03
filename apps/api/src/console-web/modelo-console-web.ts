export const FILTROS_ATENDIMENTOS_WEB = [
  'MEUS',
  'PENDENTES',
  'NAO_LIDOS',
  'SLA',
  'EXPIRANDO',
  'EM_AUTOMACAO',
] as const;

export type FiltroAtendimentosWeb = (typeof FILTROS_ATENDIMENTOS_WEB)[number];

export interface ResumoAtendimentoWeb {
  readonly atendimentoId: string;
  readonly conversaId: string;
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly nomeContato: string;
  readonly identidadeSecundaria?: string;
  readonly filaId: string;
  readonly filaNome: string;
  readonly modo: 'BOT' | 'HUMANO';
  readonly estado: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  readonly ultimaAtividadeEm: Date;
  readonly ultimaMensagemResumo: string;
  readonly ultimaMensagemDirecao?: 'ENTRADA' | 'SAIDA';
  readonly quantidadeNaoLida: number;
  readonly slaEm?: Date;
  readonly janelaExpiraEm?: Date;
}

export type TipoItemTimelineWeb =
  | 'EVENTO_OPERACIONAL'
  | 'FORMULARIO'
  | 'MENSAGEM'
  | 'NOTA_INTERNA'
  | 'SEPARADOR_ATENDIMENTO';

export interface ItemTimelineWeb {
  readonly id: string;
  readonly tipo: TipoItemTimelineWeb;
  readonly ocorridoEm: Date;
  readonly atendimentoId: string;
  readonly camposFormulario?: readonly {
    readonly rotulo: string;
    readonly valor: string;
  }[];
  readonly contaWhatsAppNome?: string;
  readonly direcao?: 'ENTRADA' | 'SAIDA';
  readonly estadoMensagem?: string;
  readonly mensagemTipo?: string;
  readonly texto?: string;
  readonly rotulo?: string;
  readonly somenteEquipe?: boolean;
  readonly respondeAMensagemId?: string;
  readonly citacaoTexto?: string;
  readonly reacoes?: readonly { readonly emoji: string; readonly somenteInterna: boolean }[];
}

export interface MarcadorLeituraWeb {
  readonly ultimaMensagemLidaId?: string;
  readonly marcadaNaoLida: boolean;
  readonly versao: number;
}

export interface PaginaTimelineWeb {
  readonly itens: readonly ItemTimelineWeb[];
  readonly marcador: MarcadorLeituraWeb;
  readonly proximoCursor?: string;
}

export interface RespostaRapidaWeb {
  readonly atalho: string;
  readonly id: string;
  readonly texto: string;
  readonly titulo: string;
}

export interface ModeloAprovadoWeb {
  readonly id: string;
  readonly idioma: string;
  readonly nome: string;
  readonly quantidadeParametros: number;
}

export interface MensagemCriadaWeb {
  readonly estado: string;
  readonly id: string;
  readonly recebidaServidorEm: Date;
}

export interface ConteudoMidiaWeb {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly nomeArquivo: string;
}

export type TipoGaleriaWeb = 'DOCUMENTOS' | 'LINKS' | 'MIDIAS';

export interface ResultadoBuscaConversaWeb {
  readonly atendimentoId: string;
  readonly contaWhatsAppNome: string;
  readonly direcao: 'ENTRADA' | 'SAIDA';
  readonly id: string;
  readonly ocorridoEm: Date;
  readonly trecho: string;
  readonly tipoMensagem: string;
}

export interface ItemGaleriaConversaWeb {
  readonly atendimentoId: string;
  readonly id: string;
  readonly ocorridoEm: Date;
  readonly tipo: TipoGaleriaWeb;
  readonly tipoMensagem: string;
  readonly trecho?: string;
  readonly mime?: string;
  readonly tamanhoBytes?: number;
}

export interface PaginaBuscaConversaWeb {
  readonly itens: readonly ResultadoBuscaConversaWeb[];
  readonly proximoCursor?: string;
}

export interface PaginaGaleriaConversaWeb {
  readonly itens: readonly ItemGaleriaConversaWeb[];
  readonly proximoCursor?: string;
}

export interface IdentidadeContatoWeb {
  readonly bsuid?: string;
  readonly nomePerfil?: string;
  readonly nomeUsuario?: string;
  readonly telefoneMascarado?: string;
}

export interface ContratoContatoWeb {
  readonly enderecoResumido?: string;
  readonly id: string;
  readonly servico?: string;
  readonly situacao: string;
}

export interface VinculoContatoWeb {
  readonly contratos: readonly ContratoContatoWeb[];
  readonly documentoMascarado?: string;
  readonly estadoSnapshot: 'ATUAL' | 'EXCLUIDO' | 'NAO_DISPONIVEL' | 'OBSOLETO';
  readonly id: string;
  readonly idadeSnapshotSegundos?: number;
  readonly nomeExibicao: string;
  readonly origem: 'SNAPSHOT';
  readonly preferencial: boolean;
  readonly tipo: string;
}

export interface DetalhesContatoWeb {
  readonly atendimentoId: string;
  readonly conversaId: string;
  readonly contatoId: string;
  readonly estadoContato: string;
  readonly filaId: string;
  readonly identidades: readonly IdentidadeContatoWeb[];
  readonly nomeExibicao: string;
  readonly contexto?: {
    readonly origem: string;
    readonly versao: number;
    readonly vinculoClienteId: string;
    readonly vinculoContratoId?: string;
  };
  readonly protocolo?: string;
  readonly contagens: { readonly atendimentos: number; readonly midias: number; readonly notas: number; readonly ordensServico: number };
  readonly permissoes: { readonly alterarContexto: boolean; readonly consultarCliente: boolean; readonly consultarContrato: boolean; readonly consultarFinanceiro: boolean; readonly criarOrdemServico: boolean; readonly executarDesbloqueio: boolean };
  readonly vinculos: readonly VinculoContatoWeb[];
}

export interface ResultadoFinanceiroContatoWeb {
  readonly cobertura?: 'INTEGRAL' | 'JANELA_LIMITADA';
  readonly codigo?: string;
  readonly faturas: readonly { readonly situacao: string; readonly valorCentavos: number; readonly vencimento: string }[];
  readonly origem: 'INDISPONIVEL' | 'TEMPO_REAL';
  readonly quantidadeMeses?: number;
}

export type AcaoErpWeb = 'CRIAR_ORDEM_SERVICO' | 'EXECUTAR_DESBLOQUEIO';
export interface PreviaAcaoErpWeb {
  readonly acao: AcaoErpWeb;
  readonly confirmacaoObrigatoria: true;
  readonly disponivel: boolean;
  readonly motivo?: string;
  readonly resumo: readonly { readonly rotulo: string; readonly valor: string }[];
}
