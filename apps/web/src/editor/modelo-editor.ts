import type { Edge, Node, XYPosition } from '@xyflow/react';

export const TIPOS_NO = [
  'INICIO',
  'FIM',
  'ENVIAR_MENSAGEM',
  'ENVIAR_BOTOES_OU_LISTA',
  'CONDICAO',
  'DEFINIR_VARIAVEL',
  'AGUARDAR',
  'HORARIO_ATENDIMENTO',
  'IDENTIFICAR_CONTATO',
  'SOLICITAR_DADOS_CONTATO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'SELECIONAR_CLIENTE',
  'SELECIONAR_CONTRATO',
  'CONSULTAR_FATURAS',
  'ENVIAR_FATURA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'CONSULTAR_SESSAO_ACESSO',
  'CRIAR_ATENDIMENTO',
  'CRIAR_ORDEM_SERVICO',
  'TRANSFERIR_PARA_FILA',
  'AGUARDAR_ATENDENTE',
  'ENCERRAR_ATENDIMENTO',
] as const;

export type TipoNo = (typeof TIPOS_NO)[number];
export type TipoReferencia =
  | 'CALENDARIO'
  | 'FILA'
  | 'FORMULARIO_WHATSAPP'
  | 'MODELO_MENSAGEM';

export interface ReferenciaEditor {
  readonly recursoId: string;
  readonly tipo: TipoReferencia;
}

export interface DadosNoEditor extends Record<string, unknown> {
  readonly tipo: TipoNo;
  readonly titulo: string;
  readonly categoria: string;
  readonly saidas: readonly string[];
  readonly parametros: Readonly<Record<string, unknown>>;
  readonly referencias: readonly ReferenciaEditor[];
  readonly variaveisEntrada: readonly string[];
  readonly variaveisSaida: readonly string[];
  readonly limiteIteracoes?: number;
}

export type NoEditor = Node<DadosNoEditor, 'noFluxo'>;

export interface VariavelEditor {
  readonly nome: string;
  readonly tipo: 'BOOLEANO' | 'DATA_HORA' | 'DECIMAL' | 'INTEIRO' | 'TEXTO' | 'UUID';
  readonly sensivel: boolean;
  readonly disponivelNaEntrada: boolean;
}

export interface DefinicaoEditor {
  readonly versaoSchema: 1;
  readonly inicioNoId: string;
  readonly variaveis: readonly VariavelEditor[];
  readonly nos: readonly NoEditor[];
  readonly conexoes: readonly Edge[];
}

export interface ItemCatalogoNo {
  readonly tipo: TipoNo;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: 'CONVERSA' | 'DECISAO' | 'DADOS' | 'ERP' | 'ROTEAMENTO';
  readonly saidas: readonly string[];
  readonly parametrosIniciais: Readonly<Record<string, unknown>>;
  readonly tipoReferencia?: TipoReferencia;
}

const SAIDAS: Readonly<Record<TipoNo, readonly string[]>> = {
  INICIO: ['SUCESSO'],
  FIM: [],
  ENVIAR_MENSAGEM: ['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA'],
  ENVIAR_BOTOES_OU_LISTA: [
    'SUCESSO',
    'FALLBACK',
    'FALHA_TEMPORARIA',
    'FALHA_DEFINITIVA',
  ],
  CONDICAO: ['VERDADEIRO', 'FALSO', 'FALHA'],
  DEFINIR_VARIAVEL: ['SUCESSO', 'FALHA'],
  AGUARDAR: ['CONCLUIDO', 'TIMEOUT', 'FALHA'],
  HORARIO_ATENDIMENTO: ['DENTRO_HORARIO', 'FORA_HORARIO', 'FALHA'],
  IDENTIFICAR_CONTATO: ['IDENTIFICADO', 'NAO_IDENTIFICADO', 'FALHA'],
  SOLICITAR_DADOS_CONTATO: ['ENVIADO', 'FALLBACK', 'FALHA'],
  SOLICITAR_FORMULARIO_WHATSAPP: ['ENVIADO', 'FALLBACK', 'FALHA'],
  SELECIONAR_CLIENTE: ['SELECIONADO', 'NAO_SELECIONADO', 'FALHA'],
  SELECIONAR_CONTRATO: ['SELECIONADO', 'NAO_SELECIONADO', 'FALHA'],
  CONSULTAR_FATURAS: ['ENCONTRADA', 'NAO_ENCONTRADA', 'ERP_INDISPONIVEL', 'FALHA'],
  ENVIAR_FATURA: ['SUCESSO', 'DADOS_INCOMPLETOS', 'ERP_INDISPONIVEL', 'FALHA'],
  VERIFICAR_DESBLOQUEIO_CONFIANCA: ['ELEGIVEL', 'NAO_ELEGIVEL', 'INDISPONIVEL', 'FALHA'],
  EXECUTAR_DESBLOQUEIO_CONFIANCA: ['CONCLUIDO', 'NAO_ELEGIVEL', 'RESULTADO_INCERTO', 'FALHA'],
  CONSULTAR_SESSAO_ACESSO: ['ENCONTRADA', 'NAO_ENCONTRADA', 'INDISPONIVEL', 'FALHA'],
  CRIAR_ATENDIMENTO: ['CRIADO', 'RESULTADO_INCERTO', 'INDISPONIVEL', 'FALHA'],
  CRIAR_ORDEM_SERVICO: ['CRIADA', 'RESULTADO_INCERTO', 'INDISPONIVEL', 'FALHA'],
  TRANSFERIR_PARA_FILA: ['TRANSFERIDO', 'FALHA'],
  AGUARDAR_ATENDENTE: ['ATENDIDO', 'TIMEOUT', 'FALHA'],
  ENCERRAR_ATENDIMENTO: ['ENCERRADO', 'FALHA'],
};

const dadosCatalogo: ReadonlyArray<
  readonly [TipoNo, string, ItemCatalogoNo['categoria'], string, Record<string, unknown>, TipoReferencia?]
> = [
  ['INICIO', 'Início', 'ROTEAMENTO', 'Ponto de entrada único.', {}],
  ['FIM', 'Fim', 'ROTEAMENTO', 'Conclui o caminho atual.', {}],
  ['ENVIAR_MENSAGEM', 'Enviar mensagem', 'CONVERSA', 'Envia um texto aprovado.', { texto: 'Digite a mensagem' }],
  ['ENVIAR_BOTOES_OU_LISTA', 'Opções', 'CONVERSA', 'Apresenta escolhas com fallback.', { opcoes: [{ id: 'opcao_1', titulo: 'Opção 1' }], texto: 'Escolha uma opção' }],
  ['CONDICAO', 'Condição', 'DECISAO', 'Compara uma variável tipada.', { operador: 'IGUAL', valor: 'valor', variavel: 'variavel' }],
  ['DEFINIR_VARIAVEL', 'Definir variável', 'DECISAO', 'Atribui um valor controlado.', { valor: 'valor', variavel: 'variavel' }],
  ['AGUARDAR', 'Aguardar', 'CONVERSA', 'Espera resposta sem prender worker.', { tempoLimiteSegundos: 300, tipo: 'RESPOSTA' }],
  ['HORARIO_ATENDIMENTO', 'Horário de atendimento', 'DECISAO', 'Consulta um calendário ativo.', {}, 'CALENDARIO'],
  ['IDENTIFICAR_CONTATO', 'Identificar contato', 'DADOS', 'Resolve apenas vínculo comprovado.', {}],
  ['SOLICITAR_DADOS_CONTATO', 'Solicitar contato', 'CONVERSA', 'Solicita dados pela capacidade oficial.', { textoFallback: 'Envie seus dados para continuarmos.' }],
  ['SOLICITAR_FORMULARIO_WHATSAPP', 'Solicitar formulário', 'CONVERSA', 'Solicita um formulário pré-cadastrado.', { textoFallback: 'Responda com os dados solicitados.' }, 'FORMULARIO_WHATSAPP'],
  ['SELECIONAR_CLIENTE', 'Selecionar cliente', 'DADOS', 'Aplica escolha explícita autorizada.', { variavel: 'cliente_selecionado' }],
  ['SELECIONAR_CONTRATO', 'Selecionar contrato', 'DADOS', 'Aplica contrato explícito do cliente.', { variavel: 'contrato_selecionado' }],
  ['CONSULTAR_FATURAS', 'Consultar faturas', 'ERP', 'Consulta financeira em tempo real.', {}],
  ['ENVIAR_FATURA', 'Enviar fatura', 'ERP', 'Compõe segunda via pelo domínio.', {}],
  ['VERIFICAR_DESBLOQUEIO_CONFIANCA', 'Verificar desbloqueio', 'ERP', 'Consulta elegibilidade sem efeito.', {}],
  ['EXECUTAR_DESBLOQUEIO_CONFIANCA', 'Executar desbloqueio', 'ERP', 'Executa somente com confirmação.', { confirmacaoExplicita: true }],
  ['CONSULTAR_SESSAO_ACESSO', 'Consultar conexão', 'ERP', 'Usa a porta de sessão quando habilitada.', {}],
  ['CRIAR_ATENDIMENTO', 'Criar atendimento ERP', 'ERP', 'Garante protocolo oficial.', {}],
  ['CRIAR_ORDEM_SERVICO', 'Criar ordem de serviço', 'ERP', 'Cria OS por operação recuperável.', { assunto: 'Atendimento técnico', confirmacaoExplicita: true, descricao: 'Descrição aprovada da solicitação' }],
  ['TRANSFERIR_PARA_FILA', 'Transferir para fila', 'ROTEAMENTO', 'Encaminha sem inventar responsável.', {}, 'FILA'],
  ['AGUARDAR_ATENDENTE', 'Aguardar atendente', 'ROTEAMENTO', 'Mantém espera humana recuperável.', { tempoLimiteSegundos: 1800 }, 'FILA'],
  ['ENCERRAR_ATENDIMENTO', 'Encerrar atendimento', 'ROTEAMENTO', 'Encerra com fallback humano.', { motivo: 'Fluxo concluído' }, 'FILA'],
];

export const CATALOGO_NOS: readonly ItemCatalogoNo[] = dadosCatalogo.map(
  ([tipo, titulo, categoria, descricao, parametrosIniciais, tipoReferencia]) => ({
    categoria,
    descricao,
    parametrosIniciais,
    saidas: SAIDAS[tipo],
    tipo,
    titulo,
    ...(tipoReferencia === undefined ? {} : { tipoReferencia }),
  }),
);

export function criarNo(tipo: TipoNo, posicao: XYPosition, indice: number): NoEditor {
  const item = CATALOGO_NOS.find((candidato) => candidato.tipo === tipo);
  if (item === undefined) throw new Error('TIPO_NO_INDISPONIVEL');
  return {
    data: {
      categoria: item.categoria,
      parametros: structuredClone(item.parametrosIniciais),
      referencias: [],
      saidas: item.saidas,
      tipo,
      titulo: item.titulo,
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    id: `${tipo.toLocaleLowerCase('pt-BR')}_${indice}`,
    position: posicao,
    type: 'noFluxo',
  };
}

export function definicaoInicial(): DefinicaoEditor {
  return {
    conexoes: [],
    inicioNoId: 'inicio',
    nos: [
      { ...criarNo('INICIO', { x: 80, y: 180 }, 1), id: 'inicio' },
      { ...criarNo('FIM', { x: 600, y: 180 }, 1), id: 'fim' },
    ],
    variaveis: [],
    versaoSchema: 1,
  };
}

export function serializarDefinicao(definicao: DefinicaoEditor): Record<string, unknown> {
  return {
    conexoes: definicao.conexoes.map((conexao) => ({
      destinoNoId: conexao.target,
      origemNoId: conexao.source,
      saida: conexao.sourceHandle ?? 'SUCESSO',
    })),
    inicioNoId: definicao.inicioNoId,
    nos: definicao.nos.map((no) => ({
      id: no.id,
      parametros: no.data.parametros,
      posicao: no.position,
      referencias: no.data.referencias,
      tipo: no.data.tipo,
      variaveisEntrada: no.data.variaveisEntrada,
      variaveisSaida: no.data.variaveisSaida,
      ...(no.data.limiteIteracoes === undefined
        ? {}
        : { limiteIteracoes: no.data.limiteIteracoes }),
    })),
    variaveis: definicao.variaveis,
    versaoSchema: 1,
  };
}

function registro(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function tipoNo(valor: unknown): valor is TipoNo {
  return typeof valor === 'string' && TIPOS_NO.some((tipo) => tipo === valor);
}

export function lerDefinicao(valor: Record<string, unknown>): DefinicaoEditor {
  if (!Array.isArray(valor.nos) || !Array.isArray(valor.conexoes) || !Array.isArray(valor.variaveis)) {
    throw new Error('DEFINICAO_EDITOR_INVALIDA');
  }
  const nos = valor.nos.map((item, indice): NoEditor => {
    if (!registro(item) || typeof item.id !== 'string' || !tipoNo(item.tipo)) {
      throw new Error('NO_EDITOR_INVALIDO');
    }
    const catalogo = CATALOGO_NOS.find(({ tipo }) => tipo === item.tipo);
    if (catalogo === undefined) throw new Error('TIPO_NO_INDISPONIVEL');
    const posicao = registro(item.posicao) && typeof item.posicao.x === 'number' && typeof item.posicao.y === 'number'
      ? { x: item.posicao.x, y: item.posicao.y }
      : { x: 120 + (indice % 4) * 280, y: 100 + Math.floor(indice / 4) * 220 };
    const referencias = Array.isArray(item.referencias)
      ? item.referencias.filter(
          (referencia): referencia is ReferenciaEditor =>
            registro(referencia) &&
            typeof referencia.recursoId === 'string' &&
            typeof referencia.tipo === 'string',
        )
      : [];
    return {
      data: {
        categoria: catalogo.categoria,
        parametros: registro(item.parametros) ? item.parametros : {},
        referencias,
        saidas: catalogo.saidas,
        tipo: item.tipo,
        titulo: catalogo.titulo,
        variaveisEntrada: Array.isArray(item.variaveisEntrada)
          ? item.variaveisEntrada.filter((nome): nome is string => typeof nome === 'string')
          : [],
        variaveisSaida: Array.isArray(item.variaveisSaida)
          ? item.variaveisSaida.filter((nome): nome is string => typeof nome === 'string')
          : [],
        ...(typeof item.limiteIteracoes === 'number'
          ? { limiteIteracoes: item.limiteIteracoes }
          : {}),
      },
      id: item.id,
      position: posicao,
      type: 'noFluxo',
    };
  });
  const conexoes = valor.conexoes.flatMap((item, indice): Edge[] => {
    if (
      !registro(item) ||
      typeof item.origemNoId !== 'string' ||
      typeof item.destinoNoId !== 'string' ||
      typeof item.saida !== 'string'
    ) {
      return [];
    }
    return [{
      animated: false,
      id: `conexao_${indice}_${item.origemNoId}_${item.saida}`,
      label: item.saida.replaceAll('_', ' ').toLocaleLowerCase('pt-BR'),
      source: item.origemNoId,
      sourceHandle: item.saida,
      target: item.destinoNoId,
      type: 'smoothstep',
    }];
  });
  return {
    conexoes,
    inicioNoId: typeof valor.inicioNoId === 'string' ? valor.inicioNoId : 'inicio',
    nos,
    variaveis: valor.variaveis.filter(
      (item): item is VariavelEditor =>
        registro(item) &&
        typeof item.nome === 'string' &&
        typeof item.tipo === 'string' &&
        typeof item.sensivel === 'boolean' &&
        typeof item.disponivelNaEntrada === 'boolean',
    ),
    versaoSchema: 1,
  };
}
