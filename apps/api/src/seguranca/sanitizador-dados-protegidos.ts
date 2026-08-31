import { sanitizarTextoSensivel } from '../observabilidade/sanitizador-logs.js';
import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from './modelo-dados-protegidos.js';

const CHAVE_SENSIVEL =
  /(authorization|cookie|cpf|cnpj|formulario|linha_?digitavel|password|payload|pix|senha|segredo|token)/iu;
const PROFUNDIDADE_MAXIMA = 4;
const ITENS_MAXIMOS = 20;
const CHAVES_MAXIMAS = 40;

export class SanitizadorDadosProtegidos {
  public sanitizar(
    dados: Readonly<Record<string, unknown>> | undefined,
  ): ObjetoJsonProtegido | undefined {
    if (dados === undefined) {
      return undefined;
    }

    return this.sanitizarObjeto(dados, 0);
  }

  private sanitizarObjeto(
    dados: object,
    profundidade: number,
  ): ObjetoJsonProtegido {
    const resultado: ObjetoJsonProtegido = {};

    for (const [chave, valor] of Object.entries(dados).slice(0, CHAVES_MAXIMAS)) {
      const chaveLimitada = chave.slice(0, 100);
      resultado[chaveLimitada] = CHAVE_SENSIVEL.test(chaveLimitada)
        ? '[PROTEGIDO]'
        : this.sanitizarValor(valor, profundidade + 1);
    }

    return resultado;
  }

  private sanitizarValor(
    valor: unknown,
    profundidade: number,
  ): ValorJsonProtegido {
    if (profundidade > PROFUNDIDADE_MAXIMA) {
      return '[LIMITE_PROFUNDIDADE]';
    }
    if (valor === null || typeof valor === 'boolean') {
      return valor;
    }
    if (typeof valor === 'number') {
      return Number.isFinite(valor) ? valor : '[NUMERO_INVALIDO]';
    }
    if (typeof valor === 'string') {
      return sanitizarTextoSensivel(valor, 256);
    }
    if (Array.isArray(valor)) {
      return valor
        .slice(0, ITENS_MAXIMOS)
        .map((item) => this.sanitizarValor(item, profundidade + 1));
    }
    if (typeof valor === 'object') {
      return this.sanitizarObjeto(valor, profundidade);
    }

    return '[TIPO_NAO_SUPORTADO]';
  }
}
