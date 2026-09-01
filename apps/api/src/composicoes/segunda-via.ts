import { createHash, randomUUID } from 'node:crypto';

import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export interface EntradaComposicaoSegundaVia {
  readonly contaWhatsAppId: string;
  readonly contatoId: string;
  readonly referenciaFatura: string;
  readonly valorCentavos: number;
  readonly vencimento: Date;
  readonly documentoMidiaMensagemId?: string;
  readonly pixCopiaCola?: string;
  readonly linhaDigitavel?: string;
  readonly linkSeguro?: string;
}

export interface ComposicaoSegundaVia {
  readonly id: string;
  readonly contaWhatsAppId: string;
  readonly contatoId: string;
  readonly referenciaFatura: string;
  readonly valorCentavos: number;
  readonly vencimento: Date;
  readonly documentoMidiaMensagemId?: string;
  readonly incluiPdf: boolean;
  readonly incluiPix: boolean;
  readonly incluiLinhaDigitavel: boolean;
  readonly incluiLinkSeguro: boolean;
  readonly opcoesProtegidas: ObjetoJsonProtegido;
  readonly opcoesHash: string;
  readonly textoProtegido: string;
  readonly criadaEm: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PIX = /^[A-Za-z0-9 .,:;@+\-_/]{10,1000}$/u;
const LINHA = /^(?:[0-9][ .-]?){44,48}$/u;

export class CompositorSegundaVia {
  public compor(
    entrada: EntradaComposicaoSegundaVia,
    relogio: () => Date = () => new Date(),
  ): ComposicaoSegundaVia {
    this.validar(entrada);
    const opcoesProtegidas: ObjetoJsonProtegido = {
      ...(entrada.pixCopiaCola === undefined
        ? {}
        : { pixCopiaCola: entrada.pixCopiaCola }),
      ...(entrada.linhaDigitavel === undefined
        ? {}
        : { linhaDigitavel: entrada.linhaDigitavel }),
      ...(entrada.linkSeguro === undefined
        ? {}
        : { linkSeguro: entrada.linkSeguro }),
    };
    const opcoesHash = createHash('sha256')
      .update(JSON.stringify(opcoesProtegidas))
      .digest('hex');
    const valor = this.formatarValor(entrada.valorCentavos);
    const vencimento = entrada.vencimento.toISOString().slice(0, 10);
    const disponiveis = [
      entrada.documentoMidiaMensagemId === undefined ? undefined : 'PDF',
      entrada.pixCopiaCola === undefined ? undefined : 'Pix',
      entrada.linhaDigitavel === undefined ? undefined : 'linha digitável',
      entrada.linkSeguro === undefined ? undefined : 'link seguro',
    ].filter((item): item is string => item !== undefined);
    const complemento =
      disponiveis.length === 0
        ? 'Solicite uma nova forma de acesso à equipe.'
        : `Opções disponíveis: ${disponiveis.join(', ')}.`;
    const dadosEntrega = [
      entrada.pixCopiaCola === undefined
        ? undefined
        : `Pix copia e cola:\n${entrada.pixCopiaCola}`,
      entrada.linhaDigitavel === undefined
        ? undefined
        : `Linha digitável:\n${entrada.linhaDigitavel}`,
      entrada.linkSeguro === undefined
        ? undefined
        : `Link seguro:\n${entrada.linkSeguro}`,
    ].filter((item): item is string => item !== undefined);
    const textoProtegido = `Segunda via: ${valor}, vencimento ${vencimento}. ${complemento}${
      dadosEntrega.length === 0 ? '' : `\n\n${dadosEntrega.join('\n\n')}`
    }`;
    if (textoProtegido.length > 4_096) {
      throw new Error('COMPOSICAO_SEGUNDA_VIA_INVALIDA');
    }
    return {
      contaWhatsAppId: entrada.contaWhatsAppId,
      contatoId: entrada.contatoId,
      criadaEm: relogio(),
      ...(entrada.documentoMidiaMensagemId === undefined
        ? {}
        : { documentoMidiaMensagemId: entrada.documentoMidiaMensagemId }),
      id: randomUUID(),
      incluiLinhaDigitavel: entrada.linhaDigitavel !== undefined,
      incluiLinkSeguro: entrada.linkSeguro !== undefined,
      incluiPdf: entrada.documentoMidiaMensagemId !== undefined,
      incluiPix: entrada.pixCopiaCola !== undefined,
      opcoesHash,
      opcoesProtegidas,
      referenciaFatura: entrada.referenciaFatura,
      textoProtegido,
      valorCentavos: entrada.valorCentavos,
      vencimento: entrada.vencimento,
    };
  }

  private formatarValor(centavos: number): string {
    const inteiro = Math.floor(centavos / 100);
    const fracao = String(centavos % 100).padStart(2, '0');
    return `R$ ${inteiro.toLocaleString('pt-BR')},${fracao}`;
  }

  private validar(entrada: EntradaComposicaoSegundaVia): void {
    let linkValido = true;
    if (entrada.linkSeguro !== undefined) {
      try {
        linkValido = new URL(entrada.linkSeguro).protocol === 'https:';
      } catch {
        linkValido = false;
      }
    }
    if (
      !UUID.test(entrada.contaWhatsAppId) ||
      !UUID.test(entrada.contatoId) ||
      (entrada.documentoMidiaMensagemId !== undefined &&
        !UUID.test(entrada.documentoMidiaMensagemId)) ||
      entrada.referenciaFatura.trim().length < 1 ||
      entrada.referenciaFatura.length > 256 ||
      !Number.isSafeInteger(entrada.valorCentavos) ||
      entrada.valorCentavos < 1 ||
      Number.isNaN(entrada.vencimento.getTime()) ||
      (entrada.pixCopiaCola !== undefined && !PIX.test(entrada.pixCopiaCola)) ||
      (entrada.linhaDigitavel !== undefined &&
        !LINHA.test(entrada.linhaDigitavel)) ||
      !linkValido
    ) {
      throw new Error('COMPOSICAO_SEGUNDA_VIA_INVALIDA');
    }
  }
}
