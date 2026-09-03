import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, Equals, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import {
  FILTROS_ATENDIMENTOS_WEB,
  type FiltroAtendimentosWeb,
  type ResumoAtendimentoWeb,
  type ItemTimelineWeb,
  type PaginaTimelineWeb,
  type MensagemCriadaWeb,
  type ModeloAprovadoWeb,
  type RespostaRapidaWeb,
  type PaginaBuscaConversaWeb,
  type PaginaGaleriaConversaWeb,
  type AcaoErpWeb,
  type DetalhesContatoWeb,
  type PreviaAcaoErpWeb,
  type ResultadoFinanceiroContatoWeb,
} from '../modelo-console-web.js';

export class ResumoAtendimentoWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly conversa_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly contato_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly conta_whatsapp_id: string;
  @ApiProperty() public readonly nome_contato: string;
  @ApiProperty({ required: false }) public readonly identidade_secundaria?: string;
  @ApiProperty({ format: 'uuid' }) public readonly fila_id: string;
  @ApiProperty() public readonly fila_nome: string;
  @ApiProperty({ enum: ['BOT', 'HUMANO'] }) public readonly modo: 'BOT' | 'HUMANO';
  @ApiProperty({ enum: ['AGUARDANDO', 'EM_ATENDIMENTO'] }) public readonly estado: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  @ApiProperty({ format: 'date-time' }) public readonly ultima_atividade_em: string;
  @ApiProperty() public readonly ultima_mensagem_resumo: string;
  @ApiProperty({ enum: ['ENTRADA', 'SAIDA'], required: false }) public readonly ultima_mensagem_direcao?: 'ENTRADA' | 'SAIDA';
  @ApiProperty() public readonly quantidade_nao_lida: number;
  @ApiProperty({ format: 'date-time', required: false }) public readonly sla_em?: string;
  @ApiProperty({ format: 'date-time', required: false }) public readonly janela_expira_em?: string;

  public constructor(resumo: ResumoAtendimentoWeb) {
    this.atendimento_id = resumo.atendimentoId;
    this.conversa_id = resumo.conversaId;
    this.contato_id = resumo.contatoId;
    this.conta_whatsapp_id = resumo.contaWhatsAppId;
    this.nome_contato = resumo.nomeContato;
    if (resumo.identidadeSecundaria !== undefined) this.identidade_secundaria = resumo.identidadeSecundaria;
    this.fila_id = resumo.filaId;
    this.fila_nome = resumo.filaNome;
    this.modo = resumo.modo;
    this.estado = resumo.estado;
    this.ultima_atividade_em = resumo.ultimaAtividadeEm.toISOString();
    this.ultima_mensagem_resumo = resumo.ultimaMensagemResumo;
    if (resumo.ultimaMensagemDirecao !== undefined) this.ultima_mensagem_direcao = resumo.ultimaMensagemDirecao;
    this.quantidade_nao_lida = resumo.quantidadeNaoLida;
    if (resumo.slaEm !== undefined) this.sla_em = resumo.slaEm.toISOString();
    if (resumo.janelaExpiraEm !== undefined) this.janela_expira_em = resumo.janelaExpiraEm.toISOString();
  }
}

export class ListaAtendimentosWebDto {
  @ApiProperty({ type: [ResumoAtendimentoWebDto] })
  public readonly itens: readonly ResumoAtendimentoWebDto[];

  @ApiProperty({ enum: FILTROS_ATENDIMENTOS_WEB })
  public readonly filtro: FiltroAtendimentosWeb;

  public constructor(filtro: FiltroAtendimentosWeb, itens: readonly ResumoAtendimentoWeb[]) {
    this.filtro = filtro;
    this.itens = itens.map((item) => new ResumoAtendimentoWebDto(item));
  }
}

export class ItemTimelineWebDto {
  @ApiProperty() public readonly id: string;
  @ApiProperty({ enum: ['EVENTO_OPERACIONAL', 'FORMULARIO', 'MENSAGEM', 'NOTA_INTERNA', 'SEPARADOR_ATENDIMENTO'] })
  public readonly tipo: ItemTimelineWeb['tipo'];
  @ApiProperty({ format: 'date-time' }) public readonly ocorrido_em: string;
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty({ required: false, type: 'array', items: { type: 'object', required: ['rotulo', 'valor'], properties: { rotulo: { type: 'string' }, valor: { type: 'string' } } } })
  public readonly campos_formulario?: readonly { readonly rotulo: string; readonly valor: string }[];
  @ApiProperty({ required: false }) public readonly conta_whatsapp_nome?: string;
  @ApiProperty({ enum: ['ENTRADA', 'SAIDA'], required: false }) public readonly direcao?: 'ENTRADA' | 'SAIDA';
  @ApiProperty({ required: false }) public readonly estado_mensagem?: string;
  @ApiProperty({ required: false }) public readonly mensagem_tipo?: string;
  @ApiProperty({ required: false }) public readonly texto?: string;
  @ApiProperty({ required: false }) public readonly rotulo?: string;
  @ApiProperty({ required: false }) public readonly somente_equipe?: boolean;
  @ApiProperty({ format: 'uuid', required: false }) public readonly responde_a_mensagem_id?: string;
  @ApiProperty({ required: false }) public readonly citacao_texto?: string;
  @ApiProperty({ required: false, type: 'array', items: { type: 'object', properties: { emoji: { type: 'string' }, somente_interna: { type: 'boolean' } } } })
  public readonly reacoes?: readonly { readonly emoji: string; readonly somente_interna: boolean }[];

  public constructor(item: ItemTimelineWeb) {
    this.id = item.id;
    this.tipo = item.tipo;
    this.ocorrido_em = item.ocorridoEm.toISOString();
    this.atendimento_id = item.atendimentoId;
    if (item.camposFormulario !== undefined) this.campos_formulario = item.camposFormulario;
    if (item.contaWhatsAppNome !== undefined) this.conta_whatsapp_nome = item.contaWhatsAppNome;
    if (item.direcao !== undefined) this.direcao = item.direcao;
    if (item.estadoMensagem !== undefined) this.estado_mensagem = item.estadoMensagem;
    if (item.mensagemTipo !== undefined) this.mensagem_tipo = item.mensagemTipo;
    if (item.texto !== undefined) this.texto = item.texto;
    if (item.rotulo !== undefined) this.rotulo = item.rotulo;
    if (item.somenteEquipe !== undefined) this.somente_equipe = item.somenteEquipe;
    if (item.respondeAMensagemId !== undefined) this.responde_a_mensagem_id = item.respondeAMensagemId;
    if (item.citacaoTexto !== undefined) this.citacao_texto = item.citacaoTexto;
    if (item.reacoes !== undefined) this.reacoes = item.reacoes.map((reacao) => ({ emoji: reacao.emoji, somente_interna: reacao.somenteInterna }));
  }
}

export class PaginaTimelineWebDto {
  @ApiProperty({ type: [ItemTimelineWebDto] }) public readonly itens: readonly ItemTimelineWebDto[];
  @ApiProperty({ required: false }) public readonly proximo_cursor?: string;
  @ApiProperty() public readonly marcador: {
    readonly ultima_mensagem_lida_id?: string;
    readonly marcada_nao_lida: boolean;
    readonly versao: number;
  };

  public constructor(pagina: PaginaTimelineWeb) {
    this.itens = pagina.itens.map((item) => new ItemTimelineWebDto(item));
    if (pagina.proximoCursor !== undefined) this.proximo_cursor = pagina.proximoCursor;
    this.marcador = {
      ...(pagina.marcador.ultimaMensagemLidaId === undefined ? {} : { ultima_mensagem_lida_id: pagina.marcador.ultimaMensagemLidaId }),
      marcada_nao_lida: pagina.marcador.marcadaNaoLida,
      versao: pagina.marcador.versao,
    };
  }
}

export class EntradaLeituraTimelineWebDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly mensagem_id!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_esperada!: number;
}

export class EntradaMarcarNaoLidaWebDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public readonly versao_esperada!: number;
}

export class MarcadorLeituraWebDto {
  @ApiProperty() public readonly versao: number;
  public constructor(versao: number) { this.versao = versao; }
}

export class RespostaRapidaWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly titulo: string;
  @ApiProperty() public readonly atalho: string;
  @ApiProperty() public readonly texto: string;
  public constructor(item: RespostaRapidaWeb) { Object.assign(this, item); this.id = item.id; this.titulo = item.titulo; this.atalho = item.atalho; this.texto = item.texto; }
}

export class ModeloAprovadoWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly nome: string;
  @ApiProperty() public readonly idioma: string;
  @ApiProperty() public readonly quantidade_parametros: number;
  public constructor(item: ModeloAprovadoWeb) { this.id = item.id; this.nome = item.nome; this.idioma = item.idioma; this.quantidade_parametros = item.quantidadeParametros; }
}

export class EntradaEnvioTextoWebDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly mensagem_cliente_id!: string;
  @ApiProperty({ maxLength: 4096 }) @IsString() @Length(1, 4096) public readonly texto!: string;
  @ApiProperty({ format: 'uuid', required: false }) @IsOptional() @IsUUID() public readonly responde_a_mensagem_id?: string;
}

export class EntradaReacaoWebDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly mensagem_cliente_id!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly mensagem_alvo_id!: string;
  @ApiProperty({ enum: ['👍', '❤️', '😂', '😮', '😢', '🙏'] })
  @IsIn(['👍', '❤️', '😂', '😮', '😢', '🙏'])
  public readonly emoji!: string;
}

export class EntradaEnvioModeloWebDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly mensagem_cliente_id!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly modelo_id!: string;
  @ApiProperty({ maxItems: 100, type: [String] })
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(1000, { each: true })
  public readonly parametros!: string[];
}

export class MensagemCriadaWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly estado: string;
  @ApiProperty({ format: 'date-time' }) public readonly recebida_servidor_em: string;
  public constructor(item: MensagemCriadaWeb) { this.id = item.id; this.estado = item.estado; this.recebida_servidor_em = item.recebidaServidorEm.toISOString(); }
}

export class ResultadoBuscaConversaWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty() public readonly conta_whatsapp_nome: string;
  @ApiProperty({ enum: ['ENTRADA', 'SAIDA'] }) public readonly direcao: 'ENTRADA' | 'SAIDA';
  @ApiProperty({ format: 'date-time' }) public readonly ocorrido_em: string;
  @ApiProperty() public readonly trecho: string;
  @ApiProperty() public readonly tipo_mensagem: string;
  public constructor(item: PaginaBuscaConversaWeb['itens'][number]) {
    this.id = item.id; this.atendimento_id = item.atendimentoId; this.conta_whatsapp_nome = item.contaWhatsAppNome;
    this.direcao = item.direcao; this.ocorrido_em = item.ocorridoEm.toISOString(); this.trecho = item.trecho; this.tipo_mensagem = item.tipoMensagem;
  }
}

export class PaginaBuscaConversaWebDto {
  @ApiProperty({ type: [ResultadoBuscaConversaWebDto] }) public readonly itens: readonly ResultadoBuscaConversaWebDto[];
  @ApiProperty({ required: false }) public readonly proximo_cursor?: string;
  public constructor(pagina: PaginaBuscaConversaWeb) {
    this.itens = pagina.itens.map((item) => new ResultadoBuscaConversaWebDto(item));
    if (pagina.proximoCursor !== undefined) this.proximo_cursor = pagina.proximoCursor;
  }
}

export class ItemGaleriaConversaWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty({ format: 'date-time' }) public readonly ocorrido_em: string;
  @ApiProperty({ enum: ['DOCUMENTOS', 'LINKS', 'MIDIAS'] }) public readonly tipo: 'DOCUMENTOS' | 'LINKS' | 'MIDIAS';
  @ApiProperty() public readonly tipo_mensagem: string;
  @ApiProperty({ required: false }) public readonly trecho?: string;
  @ApiProperty({ required: false }) public readonly mime?: string;
  @ApiProperty({ required: false }) public readonly tamanho_bytes?: number;
  public constructor(item: PaginaGaleriaConversaWeb['itens'][number]) {
    this.id = item.id; this.atendimento_id = item.atendimentoId; this.ocorrido_em = item.ocorridoEm.toISOString();
    this.tipo = item.tipo; this.tipo_mensagem = item.tipoMensagem;
    if (item.trecho !== undefined) this.trecho = item.trecho;
    if (item.mime !== undefined) this.mime = item.mime;
    if (item.tamanhoBytes !== undefined) this.tamanho_bytes = item.tamanhoBytes;
  }
}

export class PaginaGaleriaConversaWebDto {
  @ApiProperty({ type: [ItemGaleriaConversaWebDto] }) public readonly itens: readonly ItemGaleriaConversaWebDto[];
  @ApiProperty({ required: false }) public readonly proximo_cursor?: string;
  public constructor(pagina: PaginaGaleriaConversaWeb) {
    this.itens = pagina.itens.map((item) => new ItemGaleriaConversaWebDto(item));
    if (pagina.proximoCursor !== undefined) this.proximo_cursor = pagina.proximoCursor;
  }
}

export class IdentidadeContatoWebDto {
  @ApiProperty({ required: false }) public readonly bsuid?: string;
  @ApiProperty({ required: false }) public readonly nome_perfil?: string;
  @ApiProperty({ required: false }) public readonly nome_usuario?: string;
  @ApiProperty({ required: false }) public readonly telefone_mascarado?: string;
  public constructor(item: DetalhesContatoWeb['identidades'][number]) { if (item.bsuid !== undefined) this.bsuid = item.bsuid; if (item.nomePerfil !== undefined) this.nome_perfil = item.nomePerfil; if (item.nomeUsuario !== undefined) this.nome_usuario = item.nomeUsuario; if (item.telefoneMascarado !== undefined) this.telefone_mascarado = item.telefoneMascarado; }
}

export class ContratoContatoWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly situacao: string;
  @ApiProperty({ required: false }) public readonly servico?: string;
  @ApiProperty({ required: false }) public readonly endereco_resumido?: string;
  public constructor(item: DetalhesContatoWeb['vinculos'][number]['contratos'][number]) { this.id = item.id; this.situacao = item.situacao; if (item.servico !== undefined) this.servico = item.servico; if (item.enderecoResumido !== undefined) this.endereco_resumido = item.enderecoResumido; }
}

export class VinculoContatoWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly nome_exibicao: string;
  @ApiProperty() public readonly tipo: string;
  @ApiProperty() public readonly preferencial: boolean;
  @ApiProperty({ enum: ['SNAPSHOT'] }) public readonly origem: 'SNAPSHOT';
  @ApiProperty({ enum: ['ATUAL', 'EXCLUIDO', 'NAO_DISPONIVEL', 'OBSOLETO'] }) public readonly estado_snapshot: 'ATUAL' | 'EXCLUIDO' | 'NAO_DISPONIVEL' | 'OBSOLETO';
  @ApiProperty({ required: false }) public readonly idade_snapshot_segundos?: number;
  @ApiProperty({ required: false }) public readonly documento_mascarado?: string;
  @ApiProperty({ type: [ContratoContatoWebDto] }) public readonly contratos: readonly ContratoContatoWebDto[];
  public constructor(item: DetalhesContatoWeb['vinculos'][number]) { this.id = item.id; this.nome_exibicao = item.nomeExibicao; this.tipo = item.tipo; this.preferencial = item.preferencial; this.origem = item.origem; this.estado_snapshot = item.estadoSnapshot; if (item.idadeSnapshotSegundos !== undefined) this.idade_snapshot_segundos = item.idadeSnapshotSegundos; if (item.documentoMascarado !== undefined) this.documento_mascarado = item.documentoMascarado; this.contratos = item.contratos.map((contrato) => new ContratoContatoWebDto(contrato)); }
}

export class DetalhesContatoWebDto {
  @ApiProperty({ format: 'uuid' }) public readonly atendimento_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly conversa_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly contato_id: string;
  @ApiProperty({ format: 'uuid' }) public readonly fila_id: string;
  @ApiProperty() public readonly nome_exibicao: string;
  @ApiProperty() public readonly estado_contato: string;
  @ApiProperty({ type: [IdentidadeContatoWebDto] }) public readonly identidades: readonly IdentidadeContatoWebDto[];
  @ApiProperty({ required: false, type: Object }) public readonly contexto?: { readonly origem: string; readonly versao: number; readonly vinculo_cliente_id: string; readonly vinculo_contrato_id?: string };
  @ApiProperty({ required: false }) public readonly protocolo?: string;
  @ApiProperty({ type: 'object', properties: { atendimentos: { type: 'number' }, midias: { type: 'number' }, notas: { type: 'number' }, ordens_servico: { type: 'number' } } }) public readonly contagens: { readonly atendimentos: number; readonly midias: number; readonly notas: number; readonly ordens_servico: number };
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } }) public readonly permissoes: DetalhesContatoWeb['permissoes'];
  @ApiProperty({ type: [VinculoContatoWebDto] }) public readonly vinculos: readonly VinculoContatoWebDto[];
  public constructor(item: DetalhesContatoWeb) { this.atendimento_id = item.atendimentoId; this.conversa_id = item.conversaId; this.contato_id = item.contatoId; this.fila_id = item.filaId; this.nome_exibicao = item.nomeExibicao; this.estado_contato = item.estadoContato; this.identidades = item.identidades.map((identidade) => new IdentidadeContatoWebDto(identidade)); if (item.contexto !== undefined) this.contexto = { origem: item.contexto.origem, versao: item.contexto.versao, vinculo_cliente_id: item.contexto.vinculoClienteId, ...(item.contexto.vinculoContratoId === undefined ? {} : { vinculo_contrato_id: item.contexto.vinculoContratoId }) }; if (item.protocolo !== undefined) this.protocolo = item.protocolo; this.contagens = { atendimentos: item.contagens.atendimentos, midias: item.contagens.midias, notas: item.contagens.notas, ordens_servico: item.contagens.ordensServico }; this.permissoes = item.permissoes; this.vinculos = item.vinculos.map((vinculo) => new VinculoContatoWebDto(vinculo)); }
}

export class EntradaAlterarContextoWebDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly vinculo_cliente_id!: string;
  @ApiProperty({ format: 'uuid', required: false }) @IsOptional() @IsUUID() public readonly vinculo_contrato_id?: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly versao_esperada!: number;
}

class FaturaFinanceiraContatoWebDto {
  @ApiProperty() public readonly situacao: string;
  @ApiProperty() public readonly valor_centavos: number;
  @ApiProperty() public readonly vencimento: string;

  public constructor(item: ResultadoFinanceiroContatoWeb['faturas'][number]) {
    this.situacao = item.situacao;
    this.valor_centavos = item.valorCentavos;
    this.vencimento = item.vencimento;
  }
}

export class ResultadoFinanceiroContatoWebDto {
  @ApiProperty({ enum: ['INDISPONIVEL', 'TEMPO_REAL'] }) public readonly origem: 'INDISPONIVEL' | 'TEMPO_REAL';
  @ApiProperty({ enum: ['INTEGRAL', 'JANELA_LIMITADA'], required: false }) public readonly cobertura?: 'INTEGRAL' | 'JANELA_LIMITADA';
  @ApiProperty({ minimum: 1, required: false }) public readonly quantidade_meses?: number;
  @ApiProperty({ required: false }) public readonly codigo?: string;
  @ApiProperty({ type: [FaturaFinanceiraContatoWebDto] }) public readonly faturas: readonly FaturaFinanceiraContatoWebDto[];
  public constructor(item: ResultadoFinanceiroContatoWeb) { this.origem = item.origem; if (item.cobertura !== undefined) this.cobertura = item.cobertura; if (item.quantidadeMeses !== undefined) this.quantidade_meses = item.quantidadeMeses; if (item.codigo !== undefined) this.codigo = item.codigo; this.faturas = item.faturas.map((fatura) => new FaturaFinanceiraContatoWebDto(fatura)); }
}

export class EntradaPrepararAcaoErpWebDto { @ApiProperty({ enum: ['CRIAR_ORDEM_SERVICO', 'EXECUTAR_DESBLOQUEIO'] }) @IsIn(['CRIAR_ORDEM_SERVICO', 'EXECUTAR_DESBLOQUEIO']) public readonly acao!: AcaoErpWeb; }

export class PreviaAcaoErpWebDto {
  @ApiProperty({ enum: ['CRIAR_ORDEM_SERVICO', 'EXECUTAR_DESBLOQUEIO'] }) public readonly acao: AcaoErpWeb;
  @ApiProperty() public readonly confirmacao_obrigatoria: true;
  @ApiProperty() public readonly disponivel: boolean;
  @ApiProperty({ required: false }) public readonly motivo?: string;
  @ApiProperty({ type: 'array', items: { type: 'object', properties: { rotulo: { type: 'string' }, valor: { type: 'string' } } } }) public readonly resumo: readonly { readonly rotulo: string; readonly valor: string }[];
  public constructor(item: PreviaAcaoErpWeb) { this.acao = item.acao; this.confirmacao_obrigatoria = item.confirmacaoObrigatoria; this.disponivel = item.disponivel; if (item.motivo !== undefined) this.motivo = item.motivo; this.resumo = item.resumo; }
}

export class EntradaExecutarAcaoErpWebDto {
  @ApiProperty({ enum: ['CRIAR_ORDEM_SERVICO', 'EXECUTAR_DESBLOQUEIO'] }) @IsIn(['CRIAR_ORDEM_SERVICO', 'EXECUTAR_DESBLOQUEIO']) public readonly acao!: AcaoErpWeb;
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly chave_idempotencia!: string;
  @ApiProperty({ enum: [true] }) @Equals(true) public readonly confirmacao_explicita!: true;
  @ApiProperty({ maxLength: 200, required: false }) @IsOptional() @IsString() @Length(1, 200) public readonly assunto?: string;
  @ApiProperty({ maxLength: 4000, required: false }) @IsOptional() @IsString() @Length(1, 4000) public readonly descricao?: string;
}

export class ResultadoAcaoErpWebDto { @ApiProperty() public readonly situacao: string; @ApiProperty({ required: false }) public readonly operacao_id?: string; public constructor(item: { readonly situacao: string; readonly operacaoId?: string }) { this.situacao = item.situacao; if (item.operacaoId !== undefined) this.operacao_id = item.operacaoId; } }
