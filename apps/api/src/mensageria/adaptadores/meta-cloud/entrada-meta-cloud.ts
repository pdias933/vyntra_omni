import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoIdentidadeWhatsApp } from '../../../contatos/servico-identidade-whatsapp.js';
import { ServicoConversas } from '../../../conversas/servico-conversas.js';
import { ServicoEventoDominio } from '../../../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../../../persistencia/transacao-prisma.js';
import { ServicoProtocolosErp } from '../../../protocolos-erp/servico-protocolos-erp.js';
import { caracterizarIdentidadeWebhookMetaCloud } from './identidade-webhook-meta-cloud.js';
import {
  REPOSITORIO_ENTRADA_META_CLOUD,
  type RepositorioEntradaMetaCloud,
} from './repositorio-entrada-meta-cloud.js';

export interface ResultadoEntradaMetaCloud {
  readonly resultado: 'DUPLICADA' | 'PERSISTIDA';
  readonly mensagemId: string | undefined;
}

interface EntradaNormalizadaMetaCloud {
  readonly identificadorContaExterno: string;
  readonly identificadorMensagemExterno: string;
  readonly identidade: ReturnType<typeof caracterizarIdentidadeWebhookMetaCloud>;
  readonly ocorridaEm: Date;
  readonly texto: string;
}

interface WebhookMensagemMetaCloud {
  readonly object?: unknown;
  readonly entry?: readonly {
    readonly changes?: readonly {
      readonly value?: {
        readonly messaging_product?: unknown;
        readonly metadata?: { readonly phone_number_id?: unknown };
        readonly contacts?: readonly unknown[];
        readonly messages?: readonly {
          readonly id?: unknown;
          readonly timestamp?: unknown;
          readonly type?: unknown;
          readonly text?: { readonly body?: unknown };
        }[];
      };
    }[];
  }[];
}

@Injectable()
export class AdaptadorEntradaMetaCloud {
  public constructor(
    @Inject(REPOSITORIO_ENTRADA_META_CLOUD)
    private readonly repositorio: RepositorioEntradaMetaCloud,
    @Inject(ServicoIdentidadeWhatsApp)
    private readonly identidades: ServicoIdentidadeWhatsApp,
    @Inject(ServicoConversas) private readonly conversas: ServicoConversas,
    @Inject(ServicoProtocolosErp)
    private readonly protocolos: ServicoProtocolosErp,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
  ) {}

  public async receber(
    corpoBruto: Uint8Array,
    assinatura: string,
    segredoAplicativo: Uint8Array,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoEntradaMetaCloud> {
    this.verificarAssinatura(corpoBruto, assinatura, segredoAplicativo);
    const entrada = this.normalizar(corpoBruto);
    const agora = relogio();
    if (!Number.isFinite(agora.getTime()) || entrada.ocorridaEm > agora) {
      throw new Error('WEBHOOK_META_CLOUD_INVALIDO');
    }
    const conta = await this.repositorio.obterContaAtiva(
      entrada.identificadorContaExterno,
      transacao,
    );
    if (conta === undefined) throw new Error('CONTA_META_CLOUD_DESCONHECIDA');
    const corpoHash = createHash('sha256').update(corpoBruto).digest('hex');
    const recepcaoId = randomUUID();
    const registrada = await this.repositorio.registrarRecepcaoSeNova(
      {
        corpoHash,
        id: recepcaoId,
        identificadorEventoExterno: entrada.identificadorMensagemExterno,
        contaWhatsAppId: conta.id,
        recebidoEm: agora,
      },
      transacao,
    );
    if (!registrada) return { mensagemId: undefined, resultado: 'DUPLICADA' };
    const identidade = await this.identidades.resolver(
      {
        contaWhatsAppId: conta.id,
        identificadorExternoEstavel:
          entrada.identidade.identificadorExternoEstavel,
        ...(entrada.identidade.nomePerfil === undefined
          ? {}
          : { nomePerfil: entrada.identidade.nomePerfil }),
        ...(entrada.identidade.nomeUsuario === undefined
          ? {}
          : { nomeUsuario: entrada.identidade.nomeUsuario }),
        ...(entrada.identidade.telefoneE164 === undefined
          ? {}
          : { telefoneE164: entrada.identidade.telefoneE164 }),
      },
      transacao,
      relogio,
    );
    const conversa = await this.conversas.obterOuCriar(
      {
        contaWhatsAppId: conta.id,
        contatoId: identidade.contato.id,
        interacaoEm: entrada.ocorridaEm,
      },
      transacao,
      relogio,
    );
    const atendimento = await this.repositorio.obterOuCriarAtendimento(
      conversa.conversa.id,
      conta.id,
      agora,
      transacao,
    );
    if (atendimento.criado) {
      await this.protocolos.inicializarPendente(atendimento.id, transacao, relogio);
    }
    const mensagemId = randomUUID();
    await this.repositorio.acrescentarMensagem(
      {
        atendimentoId: atendimento.id,
        contaWhatsAppId: conta.id,
        contatoRemetenteId: identidade.contato.id,
        conteudoHash: createHash('sha256').update(entrada.texto).digest('hex'),
        conteudoProtegido: { texto: entrada.texto },
        conversaId: conversa.conversa.id,
        criadaDispositivoEm: entrada.ocorridaEm,
        id: mensagemId,
        identificadorExternoMensagem: entrada.identificadorMensagemExterno,
        recebidaServidorEm: agora,
      },
      transacao,
    );
    await this.repositorio.marcarPersistida(recepcaoId, mensagemId, agora, transacao);
    await this.eventos.acrescentar(
      {
        atendimentoId: atendimento.id,
        classificacaoDados: 'OPERACIONAL',
        conversaId: conversa.conversa.id,
        dados: { contaWhatsAppId: conta.id, tipo: 'TEXTO' },
        entidadeId: mensagemId,
        entidadeTipo: 'MENSAGEM',
        tipo: 'MENSAGEM_ENTRADA_PERSISTIDA',
      },
      transacao,
    );
    return { mensagemId, resultado: 'PERSISTIDA' };
  }

  private verificarAssinatura(
    corpo: Uint8Array,
    assinatura: string,
    segredo: Uint8Array,
  ): void {
    const apresentada = assinatura.match(/^sha256=([0-9a-f]{64})$/u)?.[1];
    if (apresentada === undefined || segredo.byteLength < 32 || corpo.byteLength > 1_048_576) {
      throw new Error('ASSINATURA_META_CLOUD_INVALIDA');
    }
    const esperada = createHmac('sha256', segredo).update(corpo).digest();
    const recebida = Buffer.from(apresentada, 'hex');
    if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
      throw new Error('ASSINATURA_META_CLOUD_INVALIDA');
    }
  }

  private normalizar(corpo: Uint8Array): EntradaNormalizadaMetaCloud {
    let documento: unknown;
    try {
      documento = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corpo));
    } catch {
      throw new Error('WEBHOOK_META_CLOUD_INVALIDO');
    }
    const webhook = documento as WebhookMensagemMetaCloud;
    const value = webhook.entry?.[0]?.changes?.[0]?.value;
    const mensagem = value?.messages?.[0];
    const contato = value?.contacts?.[0];
    const timestamp = Number(mensagem?.timestamp) * 1_000;
    const texto = mensagem?.text?.body;
    if (
      webhook.object !== 'whatsapp_business_account' ||
      value?.messaging_product !== 'whatsapp' ||
      typeof value?.metadata?.phone_number_id !== 'string' ||
      typeof mensagem?.id !== 'string' ||
      mensagem?.type !== 'text' ||
      typeof texto !== 'string' ||
      texto.length < 1 ||
      texto.length > 4_096 ||
      !Number.isFinite(timestamp)
    ) {
      throw new Error('WEBHOOK_META_CLOUD_INVALIDO');
    }
    return {
      identificadorContaExterno: value.metadata.phone_number_id,
      identificadorMensagemExterno: mensagem.id,
      identidade: caracterizarIdentidadeWebhookMetaCloud(
        contato as Parameters<typeof caracterizarIdentidadeWebhookMetaCloud>[0],
      ),
      ocorridaEm: new Date(timestamp),
      texto,
    };
  }
}
