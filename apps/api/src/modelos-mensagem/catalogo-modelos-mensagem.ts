import { createHash, randomUUID } from 'node:crypto';

import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export type EstadoModeloMensagem =
  | 'APROVADO'
  | 'REJEITADO'
  | 'PAUSADO'
  | 'DESATIVADO';

export interface ModeloMensagemObservado {
  readonly referenciaCanal: string;
  readonly nome: string;
  readonly idioma: string;
  readonly estado: EstadoModeloMensagem;
  readonly quantidadeParametros: number;
  readonly componentesProtegidos: ObjetoJsonProtegido;
}

export interface ModeloMensagemCatalogo extends ModeloMensagemObservado {
  readonly id: string;
  readonly contaWhatsAppId: string;
  readonly componentesHash: string;
  readonly sincronizadoEm: Date;
  readonly versao: number;
}

const NOME = /^[a-z0-9_]{1,512}$/u;
const IDIOMA = /^[a-z]{2,3}(?:_[A-Z]{2})?$/u;

export class CatalogoModelosMensagem {
  public sincronizar(
    contaWhatsAppId: string,
    atuais: readonly ModeloMensagemCatalogo[],
    observados: readonly ModeloMensagemObservado[],
    sincronizadoEm: Date,
  ): readonly ModeloMensagemCatalogo[] {
    if (!Number.isFinite(sincronizadoEm.getTime())) {
      throw new Error('CATALOGO_MODELOS_INVALIDO');
    }
    const chaves = new Set<string>();
    return observados.map((observado) => {
      this.validar(observado);
      const chave = `${observado.nome}:${observado.idioma}`;
      if (chaves.has(chave)) throw new Error('MODELO_MENSAGEM_DUPLICADO');
      chaves.add(chave);
      const existente = atuais.find(
        (item) => item.nome === observado.nome && item.idioma === observado.idioma,
      );
      const componentesHash = createHash('sha256')
        .update(JSON.stringify(observado.componentesProtegidos))
        .digest('hex');
      const alterado =
        existente === undefined ||
        existente.referenciaCanal !== observado.referenciaCanal ||
        existente.estado !== observado.estado ||
        existente.quantidadeParametros !== observado.quantidadeParametros ||
        existente.componentesHash !== componentesHash;
      return {
        ...observado,
        componentesHash,
        contaWhatsAppId,
        id: existente?.id ?? randomUUID(),
        sincronizadoEm,
        versao: (existente?.versao ?? 0) + (alterado ? 1 : 0),
      };
    });
  }

  public selecionarAprovado(
    catalogo: readonly ModeloMensagemCatalogo[],
    contaWhatsAppId: string,
    nome: string,
    idioma: string,
    parametros: readonly string[],
  ): ModeloMensagemCatalogo {
    const modelo = catalogo.find(
      (item) =>
        item.contaWhatsAppId === contaWhatsAppId &&
        item.nome === nome &&
        item.idioma === idioma,
    );
    if (
      modelo?.estado !== 'APROVADO' ||
      parametros.length !== modelo.quantidadeParametros ||
      parametros.some((parametro) => parametro.trim().length < 1)
    ) {
      throw new Error('MODELO_MENSAGEM_NAO_AUTORIZADO');
    }
    return modelo;
  }

  private validar(modelo: ModeloMensagemObservado): void {
    if (
      modelo.referenciaCanal.trim().length < 1 ||
      modelo.referenciaCanal.length > 256 ||
      !NOME.test(modelo.nome) ||
      !IDIOMA.test(modelo.idioma) ||
      !Number.isInteger(modelo.quantidadeParametros) ||
      modelo.quantidadeParametros < 0 ||
      modelo.quantidadeParametros > 100 ||
      typeof modelo.componentesProtegidos !== 'object'
    ) {
      throw new Error('MODELO_MENSAGEM_INVALIDO');
    }
  }
}
