import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroMensagemInvalida } from './erros-mensagem.js';
import type {
  EventoEstadoMensagemNormalizado,
  RecepcaoEstadoMensagem,
  ResultadoEstadoMensagem,
} from './modelo-estado-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';
import {
  REPOSITORIO_ESTADOS_MENSAGEM,
  type RepositorioEstadosMensagem,
} from './repositorio-estados-mensagem.js';

const ORDEM = { ENVIADA: 1, ENTREGUE: 2, LIDA: 3 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CODIGO = /^[A-Z][A-Z0-9_]{2,99}$/u;

@Injectable()
export class ServicoEstadosMensagem {
  public constructor(
    @Inject(REPOSITORIO_ESTADOS_MENSAGEM)
    private readonly repositorio: RepositorioEstadosMensagem,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
  ) {}

  public async aplicar(
    entrada: EventoEstadoMensagemNormalizado,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoEstadoMensagem> {
    this.validar(entrada);
    const recebidaEm = relogio();
    const atual = await this.repositorio.obterMensagem(
      entrada.contaWhatsAppId,
      entrada.identificadorMensagemExterno,
      transacao,
    );
    if (atual === undefined) return { resultado: 'MENSAGEM_DESCONHECIDA' };

    const recepcao: RecepcaoEstadoMensagem = {
      aplicado: false,
      contaWhatsAppId: entrada.contaWhatsAppId,
      estado: entrada.estado,
      id: randomUUID(),
      identificadorEventoExterno: entrada.identificadorEventoExterno,
      mensagemId: atual.id,
      ocorridoEm: entrada.ocorridoEm,
      recebidoEm: recebidaEm,
      ...(entrada.codigoFalha === undefined
        ? {}
        : { codigoFalha: entrada.codigoFalha }),
    };
    if (!(await this.repositorio.registrarRecepcao(recepcao, transacao))) {
      return { mensagem: atual, resultado: 'DUPLICADO' };
    }

    const avancada = this.avancar(atual, entrada);
    if (avancada === undefined) {
      return { mensagem: atual, resultado: 'IGNORADO_POR_ESTADO' };
    }
    if (
      !(await this.repositorio.atualizarMensagem(
        avancada,
        atual.versao,
        transacao,
      ))
    ) {
      throw new Error('CONFLITO_ESTADO_MENSAGEM');
    }
    await this.repositorio.marcarAplicado(recepcao.id, recebidaEm, transacao);
    await this.eventos.acrescentar(
      {
        atendimentoId: avancada.atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: avancada.conversaId,
        dados: { estado: avancada.estadoSaida },
        entidadeId: avancada.id,
        entidadeTipo: 'MENSAGEM',
        tipo: 'ESTADO_MENSAGEM_ATUALIZADO',
      },
      transacao,
    );
    return { mensagem: avancada, resultado: 'APLICADO' };
  }

  private avancar(
    atual: MensagemSaidaPersistida,
    entrada: EventoEstadoMensagemNormalizado,
  ): MensagemSaidaPersistida | undefined {
    if (entrada.estado === 'FALHOU') {
      if (atual.estadoSaida !== 'ENVIADA') return undefined;
      return {
        ...atual,
        codigoFalha: entrada.codigoFalha,
        estadoSaida: 'FALHOU',
        falhouEm: this.naoAnterior(entrada.ocorridoEm, atual.enviadaEm),
        versao: atual.versao + 1,
      };
    }
    if (!(atual.estadoSaida in ORDEM)) return undefined;
    const estadoAtual = atual.estadoSaida as keyof typeof ORDEM;
    if (ORDEM[entrada.estado] <= ORDEM[estadoAtual]) return undefined;
    const ocorridaEm = this.naoAnterior(entrada.ocorridoEm, atual.enviadaEm);
    if (entrada.estado === 'ENTREGUE') {
      return {
        ...atual,
        entregueEm: ocorridaEm,
        estadoSaida: 'ENTREGUE',
        versao: atual.versao + 1,
      };
    }
    return {
      ...atual,
      entregueEm: atual.entregueEm ?? ocorridaEm,
      estadoSaida: 'LIDA',
      lidaEm: ocorridaEm,
      versao: atual.versao + 1,
    };
  }

  private naoAnterior(instante: Date, minimo: Date | undefined): Date {
    return minimo !== undefined && instante < minimo ? minimo : instante;
  }

  private validar(entrada: EventoEstadoMensagemNormalizado): void {
    if (
      !UUID.test(entrada.contaWhatsAppId) ||
      entrada.identificadorMensagemExterno.trim().length < 1 ||
      entrada.identificadorMensagemExterno.length > 256 ||
      entrada.identificadorEventoExterno.trim().length < 1 ||
      entrada.identificadorEventoExterno.length > 256 ||
      Number.isNaN(entrada.ocorridoEm.getTime()) ||
      (entrada.estado === 'FALHOU' &&
        (entrada.codigoFalha === undefined || !CODIGO.test(entrada.codigoFalha)))
    ) {
      throw new ErroMensagemInvalida();
    }
  }
}
