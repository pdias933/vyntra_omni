const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIPOS_ITEM = new Set([
  'EVENTO_OPERACIONAL',
  'FORMULARIO',
  'MENSAGEM',
  'NOTA_INTERNA',
  'SEPARADOR_ATENDIMENTO',
]);
const ESTADOS_SNAPSHOT = new Set([
  'ATUAL',
  'EXCLUIDO',
  'NAO_DISPONIVEL',
  'OBSOLETO',
]);
const MOTIVOS_REVISAO = new Set([
  'ATRIBUICAO_ALTERADA',
  'CONTEXTO_ALTERADO',
  'ESTADO_ALTERADO',
  'JANELA_ALTERADA',
  'JANELA_EXPIRADA',
  'TIMELINE_ALTERADA',
]);

export type TipoItemTimelineMobile =
  | 'EVENTO_OPERACIONAL'
  | 'FORMULARIO'
  | 'MENSAGEM'
  | 'NOTA_INTERNA'
  | 'SEPARADOR_ATENDIMENTO';

export interface ItemTimelineMobile {
  readonly atendimentoId: string;
  readonly camposFormulario?: readonly {
    readonly rotulo: string;
    readonly valor: string;
  }[];
  readonly citacaoTexto?: string;
  readonly contaWhatsAppNome?: string;
  readonly direcao?: 'ENTRADA' | 'SAIDA';
  readonly estadoMensagem?: string;
  readonly id: string;
  readonly mensagemTipo?: string;
  readonly ocorridoEm: string;
  readonly reacoes?: readonly {
    readonly emoji: string;
    readonly somenteInterna: boolean;
  }[];
  readonly respondeAMensagemId?: string;
  readonly rotulo?: string;
  readonly somenteEquipe?: boolean;
  readonly texto?: string;
  readonly tipo: TipoItemTimelineMobile;
}

export interface PaginaTimelineMobile {
  readonly itens: readonly ItemTimelineMobile[];
  readonly marcador: {
    readonly marcadaNaoLida: boolean;
    readonly ultimaMensagemLidaId?: string;
    readonly versao: number;
  };
  readonly proximoCursor?: string;
}

export interface IdentidadeContatoMobile {
  readonly bsuid?: string;
  readonly nomePerfil?: string;
  readonly nomeUsuario?: string;
  readonly telefoneMascarado?: string;
}

export interface ContratoContatoMobile {
  readonly enderecoResumido?: string;
  readonly id: string;
  readonly servico?: string;
  readonly situacao: string;
}

export interface VinculoContatoMobile {
  readonly contratos: readonly ContratoContatoMobile[];
  readonly documentoMascarado?: string;
  readonly estadoSnapshot: 'ATUAL' | 'EXCLUIDO' | 'NAO_DISPONIVEL' | 'OBSOLETO';
  readonly id: string;
  readonly idadeSnapshotSegundos?: number;
  readonly nomeExibicao: string;
  readonly origem: 'SNAPSHOT';
  readonly preferencial: boolean;
  readonly tipo: string;
}

export interface DetalhesContatoMobile {
  readonly atendimentoId: string;
  readonly contatoId: string;
  readonly contexto?: {
    readonly origem: string;
    readonly versao: number;
    readonly vinculoClienteId: string;
    readonly vinculoContratoId?: string;
  };
  readonly contagens: {
    readonly atendimentos: number;
    readonly midias: number;
    readonly notas: number;
    readonly ordensServico: number;
  };
  readonly conversaId: string;
  readonly estadoContato: string;
  readonly filaId: string;
  readonly identidades: readonly IdentidadeContatoMobile[];
  readonly nomeExibicao: string;
  readonly permissoes: {
    readonly alterarContexto: boolean;
    readonly consultarCliente: boolean;
    readonly consultarContrato: boolean;
    readonly consultarFinanceiro: boolean;
    readonly criarOrdemServico: boolean;
    readonly executarDesbloqueio: boolean;
  };
  readonly protocolo?: string;
  readonly vinculos: readonly VinculoContatoMobile[];
}

interface FaturaResumoFinanceiroMobile {
  readonly situacao: string;
  readonly valorCentavos: number;
  readonly vencimento: string;
}

export type ResumoFinanceiroContatoMobile =
  | {
      readonly codigo?: string;
      readonly faturas: readonly [];
      readonly origem: 'INDISPONIVEL';
    }
  | {
      readonly cobertura: 'INTEGRAL';
      readonly faturas: readonly FaturaResumoFinanceiroMobile[];
      readonly origem: 'TEMPO_REAL';
    }
  | {
      readonly cobertura: 'JANELA_LIMITADA';
      readonly faturas: readonly FaturaResumoFinanceiroMobile[];
      readonly origem: 'TEMPO_REAL';
      readonly quantidadeMeses: number;
    };

export interface RespostaRapidaMobile {
  readonly atalho: string;
  readonly id: string;
  readonly texto: string;
  readonly titulo: string;
}

export interface MensagemCriadaMobile {
  readonly estado: string;
  readonly id: string;
  readonly recebidaServidorEm: string;
}

export interface ModeloAprovadoMobile {
  readonly id: string;
  readonly idioma: string;
  readonly nome: string;
  readonly quantidadeParametros: number;
}

export type AcaoErpMobile =
  | 'CRIAR_ORDEM_SERVICO'
  | 'EXECUTAR_DESBLOQUEIO';

export interface PreviaAcaoErpMobile {
  readonly acao: AcaoErpMobile;
  readonly confirmacaoObrigatoria: true;
  readonly disponivel: boolean;
  readonly motivo?: string;
  readonly resumo: readonly {
    readonly rotulo: string;
    readonly valor: string;
  }[];
}

export interface ResultadoAcaoErpMobile {
  readonly operacaoId?: string;
  readonly situacao: string;
}

export type MotivoRevisaoTextoMobile =
  | 'ATRIBUICAO_ALTERADA'
  | 'CONTEXTO_ALTERADO'
  | 'ESTADO_ALTERADO'
  | 'JANELA_ALTERADA'
  | 'JANELA_EXPIRADA'
  | 'TIMELINE_ALTERADA';

export type ResultadoReconciliacaoTextoMobile =
  | {
      readonly estado: 'ENVIADA_PARA_FILA';
      readonly mensagem: MensagemCriadaMobile;
    }
  | {
      readonly estado: 'REVISAO_NECESSARIA';
      readonly motivos: readonly MotivoRevisaoTextoMobile[];
    };

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor as Record<string, unknown>;
}

function chavesExatas(
  valor: Record<string, unknown>,
  obrigatorias: readonly string[],
  opcionais: readonly string[] = [],
): void {
  const permitidas = new Set([...obrigatorias, ...opcionais]);
  if (
    obrigatorias.some((chave) => !(chave in valor)) ||
    Object.keys(valor).some((chave) => !permitidas.has(chave))
  ) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
}

function texto(valor: unknown, maximo: number): string {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > maximo) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor;
}

function uuid(valor: unknown): string {
  const lido = texto(valor, 36);
  if (!UUID.test(lido)) throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  return lido;
}

function inteiro(valor: unknown): number {
  if (!Number.isSafeInteger(valor) || (valor as number) < 0) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor as number;
}

function booleano(valor: unknown): boolean {
  if (typeof valor !== 'boolean') {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor;
}

function instante(valor: unknown): string {
  const lido = texto(valor, 40);
  if (Number.isNaN(new Date(lido).getTime())) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return lido;
}

function opcional<T>(valor: unknown, leitor: (item: unknown) => T): T | undefined {
  return valor === undefined ? undefined : leitor(valor);
}

function normalizarItem(valor: unknown): ItemTimelineMobile {
  const item = objeto(valor);
  chavesExatas(
    item,
    ['atendimento_id', 'id', 'ocorrido_em', 'tipo'],
    [
      'campos_formulario',
      'citacao_texto',
      'conta_whatsapp_nome',
      'direcao',
      'estado_mensagem',
      'mensagem_tipo',
      'reacoes',
      'responde_a_mensagem_id',
      'rotulo',
      'somente_equipe',
      'texto',
    ],
  );
  const tipo = texto(item.tipo, 32);
  if (!TIPOS_ITEM.has(tipo)) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const direcao = opcional(item.direcao, (direcaoRecebida) => {
    if (direcaoRecebida !== 'ENTRADA' && direcaoRecebida !== 'SAIDA') {
      throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
    return direcaoRecebida;
  });
  if (!Array.isArray(item.reacoes) && item.reacoes !== undefined) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const reacoes = (item.reacoes as unknown[] | undefined)?.map((valorReacao) => {
    const reacao = objeto(valorReacao);
    chavesExatas(reacao, ['emoji', 'somente_interna']);
    return {
      emoji: texto(reacao.emoji, 16),
      somenteInterna: booleano(reacao.somente_interna),
    };
  });
  if ((reacoes?.length ?? 0) > 50) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const camposRecebidos = item.campos_formulario;
  if (!Array.isArray(camposRecebidos) && camposRecebidos !== undefined) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const camposFormulario = camposRecebidos?.map(
    (valorCampo) => {
      const campo = objeto(valorCampo);
      chavesExatas(campo, ['rotulo', 'valor']);
      return {
        rotulo: texto(campo.rotulo, 200),
        valor: texto(campo.valor, 1_000),
      };
    },
  );
  if ((camposFormulario?.length ?? 0) > 100) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return {
    atendimentoId: uuid(item.atendimento_id),
    ...(camposFormulario === undefined || camposFormulario.length === 0
      ? {}
      : { camposFormulario }),
    ...(item.citacao_texto === undefined
      ? {}
      : { citacaoTexto: texto(item.citacao_texto, 120) }),
    ...(item.conta_whatsapp_nome === undefined
      ? {}
      : { contaWhatsAppNome: texto(item.conta_whatsapp_nome, 100) }),
    ...(direcao === undefined ? {} : { direcao }),
    ...(item.estado_mensagem === undefined
      ? {}
      : { estadoMensagem: texto(item.estado_mensagem, 64) }),
    id: texto(item.id, 128),
    ...(item.mensagem_tipo === undefined
      ? {}
      : { mensagemTipo: texto(item.mensagem_tipo, 64) }),
    ocorridoEm: instante(item.ocorrido_em),
    ...(reacoes === undefined || reacoes.length === 0 ? {} : { reacoes }),
    ...(item.responde_a_mensagem_id === undefined
      ? {}
      : { respondeAMensagemId: uuid(item.responde_a_mensagem_id) }),
    ...(item.rotulo === undefined ? {} : { rotulo: texto(item.rotulo, 200) }),
    ...(item.somente_equipe === undefined
      ? {}
      : { somenteEquipe: booleano(item.somente_equipe) }),
    ...(item.texto === undefined ? {} : { texto: texto(item.texto, 8_000) }),
    tipo: tipo as TipoItemTimelineMobile,
  };
}

export function normalizarPaginaTimelineMobile(valor: unknown): PaginaTimelineMobile {
  const pagina = objeto(valor);
  chavesExatas(pagina, ['itens', 'marcador'], ['proximo_cursor']);
  if (!Array.isArray(pagina.itens) || pagina.itens.length > 50) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const marcador = objeto(pagina.marcador);
  chavesExatas(
    marcador,
    ['marcada_nao_lida', 'versao'],
    ['ultima_mensagem_lida_id'],
  );
  return {
    itens: pagina.itens.map(normalizarItem),
    marcador: {
      marcadaNaoLida: booleano(marcador.marcada_nao_lida),
      ...(marcador.ultima_mensagem_lida_id === undefined
        ? {}
        : { ultimaMensagemLidaId: uuid(marcador.ultima_mensagem_lida_id) }),
      versao: inteiro(marcador.versao),
    },
    ...(pagina.proximo_cursor === undefined
      ? {}
      : { proximoCursor: texto(pagina.proximo_cursor, 256) }),
  };
}

function normalizarIdentidade(valor: unknown): IdentidadeContatoMobile {
  const item = objeto(valor);
  chavesExatas(item, [], [
    'bsuid',
    'nome_perfil',
    'nome_usuario',
    'telefone_mascarado',
  ]);
  return {
    ...(item.bsuid === undefined ? {} : { bsuid: texto(item.bsuid, 200) }),
    ...(item.nome_perfil === undefined
      ? {}
      : { nomePerfil: texto(item.nome_perfil, 200) }),
    ...(item.nome_usuario === undefined
      ? {}
      : { nomeUsuario: texto(item.nome_usuario, 200) }),
    ...(item.telefone_mascarado === undefined
      ? {}
      : { telefoneMascarado: texto(item.telefone_mascarado, 40) }),
  };
}

function normalizarContrato(valor: unknown): ContratoContatoMobile {
  const item = objeto(valor);
  chavesExatas(item, ['id', 'situacao'], ['endereco_resumido', 'servico']);
  return {
    ...(item.endereco_resumido === undefined
      ? {}
      : { enderecoResumido: texto(item.endereco_resumido, 500) }),
    id: uuid(item.id),
    ...(item.servico === undefined ? {} : { servico: texto(item.servico, 300) }),
    situacao: texto(item.situacao, 100),
  };
}

function normalizarVinculo(valor: unknown): VinculoContatoMobile {
  const item = objeto(valor);
  chavesExatas(
    item,
    [
      'contratos',
      'estado_snapshot',
      'id',
      'nome_exibicao',
      'origem',
      'preferencial',
      'tipo',
    ],
    ['documento_mascarado', 'idade_snapshot_segundos'],
  );
  if (!Array.isArray(item.contratos) || item.contratos.length > 100) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const estado = texto(item.estado_snapshot, 32);
  if (!ESTADOS_SNAPSHOT.has(estado) || item.origem !== 'SNAPSHOT') {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return {
    contratos: item.contratos.map(normalizarContrato),
    ...(item.documento_mascarado === undefined
      ? {}
      : { documentoMascarado: texto(item.documento_mascarado, 100) }),
    estadoSnapshot: estado as VinculoContatoMobile['estadoSnapshot'],
    id: uuid(item.id),
    ...(item.idade_snapshot_segundos === undefined
      ? {}
      : { idadeSnapshotSegundos: inteiro(item.idade_snapshot_segundos) }),
    nomeExibicao: texto(item.nome_exibicao, 300),
    origem: 'SNAPSHOT',
    preferencial: booleano(item.preferencial),
    tipo: texto(item.tipo, 64),
  };
}

export function normalizarDetalhesContatoMobile(valor: unknown): DetalhesContatoMobile {
  const detalhes = objeto(valor);
  chavesExatas(
    detalhes,
    [
      'atendimento_id',
      'contagens',
      'contato_id',
      'conversa_id',
      'estado_contato',
      'fila_id',
      'identidades',
      'nome_exibicao',
      'permissoes',
      'vinculos',
    ],
    ['contexto', 'protocolo'],
  );
  if (
    !Array.isArray(detalhes.identidades) ||
    detalhes.identidades.length > 20 ||
    !Array.isArray(detalhes.vinculos) ||
    detalhes.vinculos.length > 100
  ) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const contagens = objeto(detalhes.contagens);
  chavesExatas(contagens, ['atendimentos', 'midias', 'notas', 'ordens_servico']);
  const permissoes = objeto(detalhes.permissoes);
  chavesExatas(permissoes, [
    'alterarContexto',
    'consultarCliente',
    'consultarContrato',
    'consultarFinanceiro',
    'criarOrdemServico',
    'executarDesbloqueio',
  ]);
  const contextoRecebido = opcional(detalhes.contexto, (valorContexto) => {
    const item = objeto(valorContexto);
    chavesExatas(
      item,
      ['origem', 'versao', 'vinculo_cliente_id'],
      ['vinculo_contrato_id'],
    );
    return {
      origem: texto(item.origem, 64),
      versao: inteiro(item.versao),
      vinculoClienteId: uuid(item.vinculo_cliente_id),
      ...(item.vinculo_contrato_id === undefined
        ? {}
        : { vinculoContratoId: uuid(item.vinculo_contrato_id) }),
    };
  });
  return {
    atendimentoId: uuid(detalhes.atendimento_id),
    contatoId: uuid(detalhes.contato_id),
    ...(contextoRecebido === undefined ? {} : { contexto: contextoRecebido }),
    contagens: {
      atendimentos: inteiro(contagens.atendimentos),
      midias: inteiro(contagens.midias),
      notas: inteiro(contagens.notas),
      ordensServico: inteiro(contagens.ordens_servico),
    },
    conversaId: uuid(detalhes.conversa_id),
    estadoContato: texto(detalhes.estado_contato, 64),
    filaId: uuid(detalhes.fila_id),
    identidades: detalhes.identidades.map(normalizarIdentidade),
    nomeExibicao: texto(detalhes.nome_exibicao, 300),
    permissoes: {
      alterarContexto: booleano(permissoes.alterarContexto),
      consultarCliente: booleano(permissoes.consultarCliente),
      consultarContrato: booleano(permissoes.consultarContrato),
      consultarFinanceiro: booleano(permissoes.consultarFinanceiro),
      criarOrdemServico: booleano(permissoes.criarOrdemServico),
      executarDesbloqueio: booleano(permissoes.executarDesbloqueio),
    },
    ...(detalhes.protocolo === undefined
      ? {}
      : { protocolo: texto(detalhes.protocolo, 200) }),
    vinculos: detalhes.vinculos.map(normalizarVinculo),
  };
}

export function normalizarVersaoMarcador(valor: unknown): number {
  const resposta = objeto(valor);
  chavesExatas(resposta, ['versao']);
  return inteiro(resposta.versao);
}

export function normalizarResumoFinanceiroMobile(
  valor: unknown,
): ResumoFinanceiroContatoMobile {
  const resposta = objeto(valor);
  chavesExatas(
    resposta,
    ['faturas', 'origem'],
    ['codigo', 'cobertura', 'quantidade_meses'],
  );
  if (
    (resposta.origem !== 'INDISPONIVEL' && resposta.origem !== 'TEMPO_REAL') ||
    !Array.isArray(resposta.faturas) ||
    resposta.faturas.length > 100
  ) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const faturas = resposta.faturas.map((valorFatura) => {
    const fatura = objeto(valorFatura);
    chavesExatas(fatura, ['situacao', 'valor_centavos', 'vencimento']);
    return {
      situacao: texto(fatura.situacao, 100),
      valorCentavos: inteiro(fatura.valor_centavos),
      vencimento: texto(fatura.vencimento, 40),
    };
  });
  if (resposta.origem === 'INDISPONIVEL') {
    if (
      faturas.length !== 0 ||
      resposta.cobertura !== undefined ||
      resposta.quantidade_meses !== undefined
    ) {
      throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
    return {
      ...(resposta.codigo === undefined
        ? {}
        : { codigo: texto(resposta.codigo, 100) }),
      faturas: [],
      origem: 'INDISPONIVEL',
    };
  }
  if (resposta.codigo !== undefined) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  if (
    resposta.cobertura === 'JANELA_LIMITADA' &&
    Number.isSafeInteger(resposta.quantidade_meses) &&
    Number(resposta.quantidade_meses) >= 1 &&
    Number(resposta.quantidade_meses) <= 120
  ) {
    return {
      cobertura: 'JANELA_LIMITADA',
      faturas,
      origem: 'TEMPO_REAL',
      quantidadeMeses: Number(resposta.quantidade_meses),
    };
  }
  if (
    resposta.cobertura === 'INTEGRAL' &&
    resposta.quantidade_meses === undefined
  ) {
    return { cobertura: 'INTEGRAL', faturas, origem: 'TEMPO_REAL' };
  }
  throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
}

export function normalizarRespostasRapidasMobile(
  valor: unknown,
): readonly RespostaRapidaMobile[] {
  if (!Array.isArray(valor) || valor.length > 20) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor.map((recebida) => {
    const resposta = objeto(recebida);
    chavesExatas(resposta, ['atalho', 'id', 'texto', 'titulo']);
    return {
      atalho: texto(resposta.atalho, 80),
      id: uuid(resposta.id),
      texto: texto(resposta.texto, 4_096),
      titulo: texto(resposta.titulo, 200),
    };
  });
}

export function normalizarMensagemCriadaMobile(valor: unknown): MensagemCriadaMobile {
  const mensagem = objeto(valor);
  chavesExatas(mensagem, ['estado', 'id', 'recebida_servidor_em']);
  return {
    estado: texto(mensagem.estado, 64),
    id: uuid(mensagem.id),
    recebidaServidorEm: instante(mensagem.recebida_servidor_em),
  };
}

export function normalizarResultadoReconciliacaoTextoMobile(
  valor: unknown,
): ResultadoReconciliacaoTextoMobile {
  const resultado = objeto(valor);
  chavesExatas(resultado, ['estado', 'motivos'], ['mensagem']);
  if (!Array.isArray(resultado.motivos) || resultado.motivos.length > 6) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const motivos = resultado.motivos.map((motivo) => {
    const lido = texto(motivo, 64);
    if (!MOTIVOS_REVISAO.has(lido)) {
      throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
    return lido as MotivoRevisaoTextoMobile;
  });
  if (
    resultado.estado === 'REVISAO_NECESSARIA' &&
    motivos.length > 0 &&
    resultado.mensagem === undefined
  ) {
    return { estado: 'REVISAO_NECESSARIA', motivos };
  }
  if (
    resultado.estado === 'ENVIADA_PARA_FILA' &&
    motivos.length === 0 &&
    resultado.mensagem !== undefined
  ) {
    return {
      estado: 'ENVIADA_PARA_FILA',
      mensagem: normalizarMensagemCriadaMobile(resultado.mensagem),
    };
  }
  throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
}

export function normalizarPreviaAcaoErpMobile(
  valor: unknown,
): PreviaAcaoErpMobile {
  const previa = objeto(valor);
  chavesExatas(
    previa,
    ['acao', 'confirmacao_obrigatoria', 'disponivel', 'resumo'],
    ['motivo'],
  );
  if (
    (previa.acao !== 'CRIAR_ORDEM_SERVICO' &&
      previa.acao !== 'EXECUTAR_DESBLOQUEIO') ||
    previa.confirmacao_obrigatoria !== true ||
    typeof previa.disponivel !== 'boolean' ||
    !Array.isArray(previa.resumo) ||
    previa.resumo.length > 10
  ) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  const resumo = previa.resumo.map((valorItem) => {
    const item = objeto(valorItem);
    chavesExatas(item, ['rotulo', 'valor']);
    return {
      rotulo: texto(item.rotulo, 100),
      valor: texto(item.valor, 300),
    };
  });
  return {
    acao: previa.acao,
    confirmacaoObrigatoria: true,
    disponivel: previa.disponivel,
    ...(previa.motivo === undefined
      ? {}
      : { motivo: texto(previa.motivo, 200) }),
    resumo,
  };
}

export function normalizarResultadoAcaoErpMobile(
  valor: unknown,
): ResultadoAcaoErpMobile {
  const resultado = objeto(valor);
  chavesExatas(resultado, ['situacao'], ['operacao_id']);
  return {
    ...(resultado.operacao_id === undefined
      ? {}
      : { operacaoId: uuid(resultado.operacao_id) }),
    situacao: texto(resultado.situacao, 100),
  };
}

export function normalizarModelosAprovadosMobile(
  valor: unknown,
): readonly ModeloAprovadoMobile[] {
  if (!Array.isArray(valor) || valor.length > 20) {
    throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
  }
  return valor.map((recebido) => {
    const modelo = objeto(recebido);
    chavesExatas(modelo, ['id', 'idioma', 'nome', 'quantidade_parametros']);
    const quantidadeParametros = inteiro(modelo.quantidade_parametros);
    if (quantidadeParametros > 100) {
      throw new Error('CONTRATO_ATENDIMENTO_MOBILE_INVALIDO');
    }
    return {
      id: uuid(modelo.id),
      idioma: texto(modelo.idioma, 20),
      nome: texto(modelo.nome, 200),
      quantidadeParametros,
    };
  });
}
