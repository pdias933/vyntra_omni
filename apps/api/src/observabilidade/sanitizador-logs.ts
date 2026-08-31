const CHAVES_PERMITIDAS = new Set([
  'codigo_erro',
  'componente',
  'contexto',
  'correlacao_id',
  'duracao_ms',
  'evento',
  'mensagem',
  'metodo_http',
  'modulo',
  'operacao',
  'status_http',
]);

const EXPRESSOES_SENSIVEIS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[^\s]+/giu, 'Bearer [REMOVIDO]'],
  [/(https?:\/\/[^\s:/]+:)[^\s@]+@/giu, '$1[REMOVIDO]@'],
  [/\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/gu, '[DOCUMENTO_REMOVIDO]'],
  [/\b\d{2}[.-]?\d{3}[.-]?\d{3}[/]?\d{4}-?\d{2}\b/gu, '[DOCUMENTO_REMOVIDO]'],
  [/(senha|password|token|segredo|authorization|cookie)\s*[:=]\s*[^\s,;]+/giu, '$1=[REMOVIDO]'],
  [/\b[A-Za-z0-9+/=_-]{40,}\b/gu, '[VALOR_REMOVIDO]'],
];

export class SanitizadorLogs {
  public sanitizarTexto(valor: unknown): string {
    let texto = typeof valor === 'string' ? valor : String(valor);

    for (const [expressao, substituicao] of EXPRESSOES_SENSIVEIS) {
      texto = texto.replace(expressao, substituicao);
    }

    return texto.slice(0, 500);
  }

  public sanitizarRegistro(
    registro: Readonly<Record<string, unknown>>,
  ): Record<string, string | number> {
    const sanitizado: Record<string, string | number> = {};

    for (const [chave, valor] of Object.entries(registro)) {
      if (!CHAVES_PERMITIDAS.has(chave) || valor === undefined) {
        continue;
      }

      if (typeof valor === 'number' && Number.isFinite(valor)) {
        sanitizado[chave] = valor;
        continue;
      }

      sanitizado[chave] = this.sanitizarTexto(valor);
    }

    return sanitizado;
  }
}
