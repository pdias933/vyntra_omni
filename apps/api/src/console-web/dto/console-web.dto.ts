import { ApiProperty } from '@nestjs/swagger';
import {
  FILTROS_ATENDIMENTOS_WEB,
  type FiltroAtendimentosWeb,
  type ResumoAtendimentoWeb,
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
