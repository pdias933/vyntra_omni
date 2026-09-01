const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const NOME_CANONICO = /^[A-Z][A-Z0-9_]{2,99}$/u;

const CAPACIDADES_OBRIGATORIAS = new Set([
  'ADICIONAR_COMENTARIO_ATENDIMENTO',
  'ALTERAR_ENCERRAR_ATENDIMENTO',
  'ALTERAR_ORDEM_SERVICO',
  'CONSULTAR_CLIENTE_DOCUMENTO',
  'CRIAR_ATENDIMENTO',
  'CRIAR_ORDEM_SERVICO',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'LISTAR_CONEXOES_CLIENTE',
  'LISTAR_CONTRATOS_CLIENTE',
  'LISTAR_FATURAS',
  'OBTER_SEGUNDA_VIA',
]);

type OrigemEvidenciaMk = 'AMBIENTE_REAL' | 'FIXTURE_PUBLICA_SANITIZADA';
type EstadoObservacaoMk = 'NAO_OBSERVADA' | 'OBSERVADA_SANITIZADA';
type EstadoPaginacaoMk =
  | 'NAO_APLICAVEL_OBSERVADA'
  | 'NAO_DOCUMENTADA'
  | 'OBSERVADA_SANITIZADA';

export interface OperacaoCaracterizadaMk {
  readonly capacidadeInterna: string;
  readonly familiaExterna: string;
  readonly licenciamento: 'ESPECIAL_COMERCIAL' | 'GERAL';
  readonly requisicaoDocumentadaPublicamente: boolean;
  readonly resposta: EstadoObservacaoMk;
  readonly dtoResposta: 'NAO_CONGELADO' | 'OBSERVADO_SANITIZADO';
  readonly paginacao: EstadoPaginacaoMk;
  readonly erros: EstadoObservacaoMk;
}

export interface CaracterizacaoMkSolutions {
  readonly observadaEm: string;
  readonly origemEvidencia: OrigemEvidenciaMk;
  readonly fontesOficiais: readonly string[];
  readonly transporte: {
    readonly httpsObrigatorio: true;
    readonly perfilWebservice: 'DOCUMENTADO';
    readonly restricaoIp: 'DOCUMENTADA';
    readonly tokenExpiravel: 'DOCUMENTADO';
  };
  readonly operacoes: readonly OperacaoCaracterizadaMk[];
}

export class ValidadorCaracterizacaoMkSolutions {
  public ler(valor: unknown): CaracterizacaoMkSolutions {
    const caracterizacao = this.objeto(valor, 'CARACTERIZACAO_MK_INVALIDA');
    this.chavesExatas(caracterizacao, [
      'fontesOficiais',
      'observadaEm',
      'operacoes',
      'origemEvidencia',
      'transporte',
    ]);
    if (
      typeof caracterizacao.observadaEm !== 'string' ||
      !DATA_ISO.test(caracterizacao.observadaEm) ||
      !['AMBIENTE_REAL', 'FIXTURE_PUBLICA_SANITIZADA'].includes(
        String(caracterizacao.origemEvidencia),
      ) ||
      !Array.isArray(caracterizacao.fontesOficiais) ||
      caracterizacao.fontesOficiais.length < 2 ||
      !caracterizacao.fontesOficiais.every(
        (fonte) =>
          typeof fonte === 'string' &&
          /^https:\/\/mkloud\.atlassian\.net\/wiki\//u.test(fonte),
      ) ||
      !Array.isArray(caracterizacao.operacoes)
    ) {
      throw new Error('CARACTERIZACAO_MK_INVALIDA');
    }
    const transporte = this.objeto(
      caracterizacao.transporte,
      'TRANSPORTE_MK_INVALIDO',
    );
    this.chavesExatas(transporte, [
      'httpsObrigatorio',
      'perfilWebservice',
      'restricaoIp',
      'tokenExpiravel',
    ]);
    if (
      transporte.httpsObrigatorio !== true ||
      transporte.perfilWebservice !== 'DOCUMENTADO' ||
      transporte.restricaoIp !== 'DOCUMENTADA' ||
      transporte.tokenExpiravel !== 'DOCUMENTADO'
    ) {
      throw new Error('TRANSPORTE_MK_INVALIDO');
    }

    const capacidades = new Set<string>();
    const operacoes = caracterizacao.operacoes.map((item) => {
      const operacao = this.lerOperacao(item);
      if (capacidades.has(operacao.capacidadeInterna)) {
        throw new Error('OPERACAO_MK_DUPLICADA');
      }
      capacidades.add(operacao.capacidadeInterna);
      return operacao;
    });
    for (const capacidade of CAPACIDADES_OBRIGATORIAS) {
      if (!capacidades.has(capacidade)) {
        throw new Error('CAPACIDADE_MK_AUSENTE');
      }
    }
    return {
      fontesOficiais: [...(caracterizacao.fontesOficiais as string[])],
      observadaEm: caracterizacao.observadaEm as string,
      operacoes,
      origemEvidencia: caracterizacao.origemEvidencia as OrigemEvidenciaMk,
      transporte: {
        httpsObrigatorio: true,
        perfilWebservice: 'DOCUMENTADO',
        restricaoIp: 'DOCUMENTADA',
        tokenExpiravel: 'DOCUMENTADO',
      },
    };
  }

  public podeAtivar(caracterizacao: CaracterizacaoMkSolutions): boolean {
    return (
      caracterizacao.origemEvidencia === 'AMBIENTE_REAL' &&
      caracterizacao.operacoes.every(
        (operacao) =>
          operacao.resposta === 'OBSERVADA_SANITIZADA' &&
          operacao.dtoResposta === 'OBSERVADO_SANITIZADO' &&
          operacao.erros === 'OBSERVADA_SANITIZADA' &&
          operacao.paginacao !== 'NAO_DOCUMENTADA',
      )
    );
  }

  private lerOperacao(valor: unknown): OperacaoCaracterizadaMk {
    const operacao = this.objeto(valor, 'OPERACAO_MK_INVALIDA');
    this.chavesExatas(operacao, [
      'capacidadeInterna',
      'dtoResposta',
      'erros',
      'familiaExterna',
      'licenciamento',
      'paginacao',
      'requisicaoDocumentadaPublicamente',
      'resposta',
    ]);
    if (
      typeof operacao.capacidadeInterna !== 'string' ||
      !NOME_CANONICO.test(operacao.capacidadeInterna) ||
      typeof operacao.familiaExterna !== 'string' ||
      !/^WSMK[A-Za-z0-9]+$/u.test(operacao.familiaExterna) ||
      !['ESPECIAL_COMERCIAL', 'GERAL'].includes(String(operacao.licenciamento)) ||
      typeof operacao.requisicaoDocumentadaPublicamente !== 'boolean' ||
      !['NAO_OBSERVADA', 'OBSERVADA_SANITIZADA'].includes(
        String(operacao.resposta),
      ) ||
      !['NAO_CONGELADO', 'OBSERVADO_SANITIZADO'].includes(
        String(operacao.dtoResposta),
      ) ||
      ![
        'NAO_APLICAVEL_OBSERVADA',
        'NAO_DOCUMENTADA',
        'OBSERVADA_SANITIZADA',
      ].includes(String(operacao.paginacao)) ||
      !['NAO_OBSERVADA', 'OBSERVADA_SANITIZADA'].includes(
        String(operacao.erros),
      )
    ) {
      throw new Error('OPERACAO_MK_INVALIDA');
    }
    return operacao as unknown as OperacaoCaracterizadaMk;
  }

  private objeto(
    valor: unknown,
    erro: string,
  ): Record<string, unknown> {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      throw new Error(erro);
    }
    return valor as Record<string, unknown>;
  }

  private chavesExatas(
    objeto: Readonly<Record<string, unknown>>,
    esperadas: readonly string[],
  ): void {
    const atuais = Object.keys(objeto).sort();
    const previstas = [...esperadas].sort();
    if (
      atuais.length !== previstas.length ||
      atuais.some((chave, indice) => chave !== previstas[indice])
    ) {
      throw new Error('CAMPO_MK_NAO_CARACTERIZADO');
    }
  }
}
