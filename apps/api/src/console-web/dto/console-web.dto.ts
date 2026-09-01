import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import {
  FILTROS_ATENDIMENTOS_WEB,
  type FiltroAtendimentosWeb,
  type ResumoAtendimentoWeb,
  type ItemTimelineWeb,
  type PaginaTimelineWeb,
  type MensagemCriadaWeb,
  type ModeloAprovadoWeb,
  type RespostaRapidaWeb,
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
  @ApiProperty({ required: false }) public readonly conta_whatsapp_nome?: string;
  @ApiProperty({ enum: ['ENTRADA', 'SAIDA'], required: false }) public readonly direcao?: 'ENTRADA' | 'SAIDA';
  @ApiProperty({ required: false }) public readonly estado_mensagem?: string;
  @ApiProperty({ required: false }) public readonly mensagem_tipo?: string;
  @ApiProperty({ required: false }) public readonly texto?: string;
  @ApiProperty({ required: false }) public readonly rotulo?: string;
  @ApiProperty({ required: false }) public readonly somente_equipe?: boolean;

  public constructor(item: ItemTimelineWeb) {
    this.id = item.id;
    this.tipo = item.tipo;
    this.ocorrido_em = item.ocorridoEm.toISOString();
    this.atendimento_id = item.atendimentoId;
    if (item.contaWhatsAppNome !== undefined) this.conta_whatsapp_nome = item.contaWhatsAppNome;
    if (item.direcao !== undefined) this.direcao = item.direcao;
    if (item.estadoMensagem !== undefined) this.estado_mensagem = item.estadoMensagem;
    if (item.mensagemTipo !== undefined) this.mensagem_tipo = item.mensagemTipo;
    if (item.texto !== undefined) this.texto = item.texto;
    if (item.rotulo !== undefined) this.rotulo = item.rotulo;
    if (item.somenteEquipe !== undefined) this.somente_equipe = item.somenteEquipe;
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
