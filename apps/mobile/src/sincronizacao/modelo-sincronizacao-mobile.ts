const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SEQUENCIA = /^(0|[1-9][0-9]{0,18})$/u;
const CODIGO = /^[A-Z][A-Z0-9_]{0,63}$/u;

const ESTADOS_ATENDIMENTO = new Set([
  'AGUARDANDO',
  'EM_ATENDIMENTO',
  'ENCERRADO_REABRIVEL',
]);
const MODOS_ATENDIMENTO = new Set(['BOT', 'FILA_HUMANA', 'HUMANO']);
const MOTIVOS_ESPERA = new Set([
  'AGUARDANDO_CLIENTE',
  'AGUARDANDO_HUMANO',
  'FORA_DO_HORARIO',
  'NENHUM',
  'PROCESSANDO_BOT',
]);
const TIPOS_MENSAGEM = new Set([
  'AUDIO',
  'IMAGEM',
  'INTERATIVA',
  'MODELO_APROVADO',
  'PDF',
  'REACAO',
  'TEXTO',
  'VIDEO',
]);
const ESTADOS_SAIDA = new Set([
  'CANCELADA',
  'ENTREGUE',
  'ENVIADA',
  'ENVIANDO',
  'FALHOU',
  'LIDA',
  'NA_FILA',
]);
const TIPOS_EVENTO = new Set([
  'ATENDIMENTO_ASSUMIDO_POR_SUPERVISOR',
  'ATENDIMENTO_CRIADO',
  'ATENDIMENTO_ENCERRADO',
  'ATENDIMENTO_RESGATADO',
  'ATENDIMENTO_TRANSFERIDO_PARA_FILA',
  'ATENDIMENTO_TRANSFERIDO_PARA_USUARIO',
  'CLIENTE_AGUARDANDO',
  'DISPARO_TRANSACIONAL_CRIADO',
  'ESTADO_MENSAGEM_ATUALIZADO',
  'FORMULARIO_RECEBIDO',
  'JANELA_CANAL_ATUALIZADA_POR_ENTRADA',
  'JANELA_EXPIRANDO',
  'MENSAGEM_ENTRADA_PERSISTIDA',
  'MENSAGEM_RECEBIDA',
  'MENSAGEM_SAIDA_CRIADA',
  'NOTA_INTERNA_ADICIONADA',
  'PERMISSOES_ALTERADAS',
  'RECURSO_ATUALIZADO',
  'SLA_OBRIGACAO_HUMANA_CONCLUIDA',
  'SLA_OBRIGACAO_HUMANA_INICIADA',
]);
const CHAVES_DADOS_EVENTO = new Set([
  'contadorNaoLidas',
  'estado',
  'expiraEm',
  'filaId',
  'formularioId',
  'marco',
  'nivel',
  'origem',
  'tipo',
  'usuarioResponsavelId',
  'versao',
  'versaoAtribuicao',
  'versaoPermissoes',
  'visibilidade',
]);
const LIMITE_SNAPSHOT_CARACTERES = 64 * 1_024 * 1_024;

export type ValorJsonLocal =
  | boolean
  | number
  | ObjetoJsonLocal
  | string
  | ValorJsonLocal[]
  | null;
export interface ObjetoJsonLocal {
  readonly [chave: string]: ValorJsonLocal;
}

export interface FilaSnapshotMobile {
  readonly id: string;
  readonly nome: string;
}
export interface ConversaSnapshotMobile {
  readonly contatoId: string;
  readonly id: string;
  readonly ultimaAtividadeEm: string;
  readonly versao: number;
}
export interface AtendimentoSnapshotMobile {
  readonly atualizadoEm: string;
  readonly contaOrigemId: string;
  readonly contatoId: string;
  readonly conversaId: string;
  readonly estado: string;
  readonly filaId: string;
  readonly filaNome: string;
  readonly id: string;
  readonly identidadeSecundaria?: string;
  readonly janelaExpiraEm?: string;
  readonly modo: string;
  readonly motivoEspera: string;
  readonly nomeContato: string;
  readonly quantidadeNaoLida: number;
  readonly slaEm?: string;
  readonly ultimaAtividadeEm: string;
  readonly ultimaMensagemDirecao?: 'ENTRADA' | 'SAIDA';
  readonly ultimaMensagemResumo: string;
  readonly usuarioResponsavelId?: string;
  readonly versaoAtribuicao: number;
  readonly versaoContexto: number;
  readonly versaoEstado: number;
}
export interface MensagemSnapshotMobile {
  readonly atendimentoId: string;
  readonly contaOrigemId: string;
  readonly conteudo: ObjetoJsonLocal;
  readonly conversaId: string;
  readonly direcao: 'ENTRADA' | 'SAIDA';
  readonly estadoSaida?: string;
  readonly id: string;
  readonly mensagemAlvoReacaoId?: string;
  readonly recebidaServidorEm: string;
  readonly respondeAMensagemId?: string;
  readonly tipo: string;
  readonly versao: number;
}
export interface NotaInternaSnapshotMobile {
  readonly atendimentoId: string;
  readonly autorUsuarioId: string;
  readonly conteudo: ObjetoJsonLocal;
  readonly conversaId: string;
  readonly criadaEm: string;
  readonly id: string;
  readonly visibilidade: 'SOMENTE_EQUIPE';
}
export interface PoliticaVersaoSnapshotMobile {
  readonly plataforma: 'ANDROID' | 'IOS';
  readonly versao: number;
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
}
export interface SnapshotMobileValidado {
  readonly atendimentos: readonly AtendimentoSnapshotMobile[];
  readonly autorizacaoOffline: string;
  readonly autorizacaoOfflineValidaAte: string;
  readonly controlesRecurso: Readonly<Record<string, boolean>>;
  readonly conversas: readonly ConversaSnapshotMobile[];
  readonly filas: readonly FilaSnapshotMobile[];
  readonly geradoEm: string;
  readonly mensagensRecentes: readonly MensagemSnapshotMobile[];
  readonly notasInternasRecentes: readonly NotaInternaSnapshotMobile[];
  readonly permissoes: readonly string[];
  readonly politicasVersao: readonly PoliticaVersaoSnapshotMobile[];
  readonly sequenciaBase: string;
  readonly versaoPermissoes: number;
}
export interface EventoSincronizacaoMobile {
  readonly atendimentoId?: string;
  readonly audiencia: 'MOBILE';
  readonly conversaId?: string;
  readonly dados: Readonly<Record<string, boolean | number | string | null>>;
  readonly entidadeId: string;
  readonly entidadeTipo: string;
  readonly ocorridoEm: string;
  readonly politicaCache: 'OPERACIONAL' | 'PROTEGIDO';
  readonly sequenciaEvento: string;
  readonly tipo: string;
}
export interface LoteSincronizacaoMobile {
  readonly eventos: readonly EventoSincronizacaoMobile[];
  readonly sequenciaFinal: string;
  readonly temMais: boolean;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return valor as Record<string, unknown>;
}

function chavesExatas(
  valor: Record<string, unknown>,
  obrigatorias: readonly string[],
  opcionais: readonly string[] = [],
): void {
  const recebidas = Object.keys(valor).sort();
  const permitidas = [...obrigatorias, ...opcionais].sort();
  if (
    obrigatorias.some((chave) => !Object.hasOwn(valor, chave)) ||
    recebidas.some((chave) => !permitidas.includes(chave))
  ) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
}

function texto(valor: unknown, tamanho = 256): string {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > tamanho) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return valor;
}

function uuid(valor: unknown): string {
  const lido = texto(valor, 36);
  if (!UUID.test(lido)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  return lido;
}

function sequencia(valor: unknown): string {
  const lida = texto(valor, 19);
  if (!SEQUENCIA.test(lida)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  return lida;
}

function inteiro(valor: unknown): number {
  if (!Number.isSafeInteger(valor) || (valor as number) < 0) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return valor as number;
}

function instante(valor: unknown): string {
  const lido = texto(valor, 32);
  const data = new Date(lido);
  if (!Number.isFinite(data.getTime()) || data.toISOString() !== lido) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return lido;
}

function enumeracao(valor: unknown, permitidos: ReadonlySet<string>): string {
  const lido = texto(valor, 64);
  if (!permitidos.has(lido)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  return lido;
}

function objetoJson(valor: unknown, profundidade = 0): ValorJsonLocal {
  if (profundidade > 12) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') {
    if (typeof valor === 'string' && valor.length > 32_768) {
      throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
    return valor;
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    return valor;
  }
  if (Array.isArray(valor)) {
    if (valor.length > 500) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    return valor.map((item) => objetoJson(item, profundidade + 1));
  }
  const lido = objeto(valor);
  const entradas = Object.entries(lido);
  if (entradas.length > 200) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  const resultado: Record<string, ValorJsonLocal> = {};
  for (const [chave, item] of entradas) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/u.test(chave)) {
      throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
    resultado[chave] = objetoJson(item, profundidade + 1);
  }
  return resultado;
}

function lista<T>(
  valor: unknown,
  limite: number,
  normalizar: (item: unknown) => T,
): readonly T[] {
  if (!Array.isArray(valor) || valor.length > limite) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return valor.map(normalizar);
}

function semDuplicidade(valores: readonly string[]): void {
  if (new Set(valores).size !== valores.length) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
}

function exigirTamanhoSerializado(valor: unknown, limite: number): void {
  let serializado: string;
  try {
    serializado = JSON.stringify(valor);
  } catch {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  if (serializado.length > limite) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
}

function normalizarFila(valor: unknown): FilaSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(lido, ['id', 'nome']);
  return { id: uuid(lido.id), nome: texto(lido.nome, 120) };
}

function normalizarConversa(valor: unknown): ConversaSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(lido, ['contatoId', 'id', 'ultimaAtividadeEm', 'versao']);
  return {
    contatoId: uuid(lido.contatoId),
    id: uuid(lido.id),
    ultimaAtividadeEm: instante(lido.ultimaAtividadeEm),
    versao: inteiro(lido.versao),
  };
}

function normalizarAtendimento(valor: unknown): AtendimentoSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(
    lido,
    [
      'atualizadoEm',
      'contaOrigemId',
      'contatoId',
      'conversaId',
      'estado',
      'filaId',
      'filaNome',
      'id',
      'modo',
      'motivoEspera',
      'nomeContato',
      'quantidadeNaoLida',
      'ultimaAtividadeEm',
      'ultimaMensagemResumo',
      'versaoAtribuicao',
      'versaoContexto',
      'versaoEstado',
    ],
    [
      'identidadeSecundaria',
      'janelaExpiraEm',
      'slaEm',
      'ultimaMensagemDirecao',
      'usuarioResponsavelId',
    ],
  );
  const ultimaMensagemDirecao =
    lido.ultimaMensagemDirecao === undefined
      ? undefined
      : (enumeracao(lido.ultimaMensagemDirecao, new Set(['ENTRADA', 'SAIDA'])) as
          | 'ENTRADA'
          | 'SAIDA');
  return {
    atualizadoEm: instante(lido.atualizadoEm),
    contaOrigemId: uuid(lido.contaOrigemId),
    contatoId: uuid(lido.contatoId),
    conversaId: uuid(lido.conversaId),
    estado: enumeracao(lido.estado, ESTADOS_ATENDIMENTO),
    filaId: uuid(lido.filaId),
    filaNome: texto(lido.filaNome, 120),
    id: uuid(lido.id),
    ...(lido.identidadeSecundaria === undefined
      ? {}
      : { identidadeSecundaria: texto(lido.identidadeSecundaria, 200) }),
    ...(lido.janelaExpiraEm === undefined
      ? {}
      : { janelaExpiraEm: instante(lido.janelaExpiraEm) }),
    modo: enumeracao(lido.modo, MODOS_ATENDIMENTO),
    motivoEspera: enumeracao(lido.motivoEspera, MOTIVOS_ESPERA),
    nomeContato: texto(lido.nomeContato, 200),
    quantidadeNaoLida: inteiro(lido.quantidadeNaoLida),
    ...(lido.slaEm === undefined ? {} : { slaEm: instante(lido.slaEm) }),
    ultimaAtividadeEm: instante(lido.ultimaAtividadeEm),
    ...(ultimaMensagemDirecao === undefined ? {} : { ultimaMensagemDirecao }),
    ultimaMensagemResumo: texto(lido.ultimaMensagemResumo, 160),
    ...(lido.usuarioResponsavelId === undefined
      ? {}
      : { usuarioResponsavelId: uuid(lido.usuarioResponsavelId) }),
    versaoAtribuicao: inteiro(lido.versaoAtribuicao),
    versaoContexto: inteiro(lido.versaoContexto),
    versaoEstado: inteiro(lido.versaoEstado),
  };
}

function normalizarMensagem(valor: unknown): MensagemSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(
    lido,
    [
      'atendimentoId',
      'contaOrigemId',
      'conteudo',
      'conversaId',
      'direcao',
      'id',
      'recebidaServidorEm',
      'tipo',
      'versao',
    ],
    ['estadoSaida', 'mensagemAlvoReacaoId', 'respondeAMensagemId'],
  );
  const conteudo = objetoJson(lido.conteudo);
  if (Array.isArray(conteudo) || conteudo === null || typeof conteudo !== 'object') {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const direcao = enumeracao(lido.direcao, new Set(['ENTRADA', 'SAIDA'])) as
    | 'ENTRADA'
    | 'SAIDA';
  return {
    atendimentoId: uuid(lido.atendimentoId),
    contaOrigemId: uuid(lido.contaOrigemId),
    conteudo,
    conversaId: uuid(lido.conversaId),
    direcao,
    ...(lido.estadoSaida === undefined
      ? {}
      : { estadoSaida: enumeracao(lido.estadoSaida, ESTADOS_SAIDA) }),
    id: uuid(lido.id),
    ...(lido.mensagemAlvoReacaoId === undefined
      ? {}
      : { mensagemAlvoReacaoId: uuid(lido.mensagemAlvoReacaoId) }),
    recebidaServidorEm: instante(lido.recebidaServidorEm),
    ...(lido.respondeAMensagemId === undefined
      ? {}
      : { respondeAMensagemId: uuid(lido.respondeAMensagemId) }),
    tipo: enumeracao(lido.tipo, TIPOS_MENSAGEM),
    versao: inteiro(lido.versao),
  };
}

function normalizarNota(valor: unknown): NotaInternaSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(lido, [
    'atendimentoId',
    'autorUsuarioId',
    'conteudo',
    'conversaId',
    'criadaEm',
    'id',
    'visibilidade',
  ]);
  const conteudo = objetoJson(lido.conteudo);
  if (Array.isArray(conteudo) || conteudo === null || typeof conteudo !== 'object') {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  if (lido.visibilidade !== 'SOMENTE_EQUIPE') {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return {
    atendimentoId: uuid(lido.atendimentoId),
    autorUsuarioId: uuid(lido.autorUsuarioId),
    conteudo,
    conversaId: uuid(lido.conversaId),
    criadaEm: instante(lido.criadaEm),
    id: uuid(lido.id),
    visibilidade: 'SOMENTE_EQUIPE',
  };
}

function normalizarPolitica(valor: unknown): PoliticaVersaoSnapshotMobile {
  const lido = objeto(valor);
  chavesExatas(lido, [
    'plataforma',
    'versao',
    'versaoMinima',
    'versaoRecomendada',
  ]);
  if (lido.plataforma !== 'ANDROID' && lido.plataforma !== 'IOS') {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const padraoVersao = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
  const minima = texto(lido.versaoMinima, 64);
  const recomendada = texto(lido.versaoRecomendada, 64);
  if (!padraoVersao.test(minima) || !padraoVersao.test(recomendada)) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return {
    plataforma: lido.plataforma,
    versao: inteiro(lido.versao),
    versaoMinima: minima,
    versaoRecomendada: recomendada,
  };
}

export function normalizarSnapshotMobile(valor: unknown): SnapshotMobileValidado {
  exigirTamanhoSerializado(valor, LIMITE_SNAPSHOT_CARACTERES);
  const lido = objeto(valor);
  chavesExatas(lido, [
    'atendimentos',
    'autorizacao_offline',
    'autorizacao_offline_valida_ate',
    'controles_recurso',
    'conversas',
    'filas',
    'gerado_em',
    'mensagens_recentes',
    'notas_internas_recentes',
    'permissoes',
    'politicas_versao',
    'sequencia_base',
    'versao_permissoes',
  ]);
  const filas = lista(lido.filas, 500, normalizarFila);
  const conversas = lista(lido.conversas, 200, normalizarConversa);
  const atendimentos = lista(lido.atendimentos, 5_000, normalizarAtendimento);
  const mensagens = lista(lido.mensagens_recentes, 40_000, normalizarMensagem);
  const notas = lista(lido.notas_internas_recentes, 40_000, normalizarNota);
  semDuplicidade(filas.map(({ id }) => id));
  semDuplicidade(conversas.map(({ id }) => id));
  semDuplicidade(atendimentos.map(({ id }) => id));
  semDuplicidade(mensagens.map(({ id }) => id));
  semDuplicidade(notas.map(({ id }) => id));

  const filaIds = new Set(filas.map(({ id }) => id));
  const conversaIds = new Set(conversas.map(({ id }) => id));
  const contatoPorConversa = new Map(
    conversas.map(({ contatoId, id }) => [id, contatoId]),
  );
  if (
    atendimentos.some(
      ({ contatoId, conversaId, filaId }) =>
        !filaIds.has(filaId) ||
        !conversaIds.has(conversaId) ||
        contatoPorConversa.get(conversaId) !== contatoId,
    ) ||
    mensagens.some(({ conversaId }) => !conversaIds.has(conversaId)) ||
    notas.some(({ conversaId }) => !conversaIds.has(conversaId))
  ) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }

  const permissoes = lista(lido.permissoes, 100, (item) => {
    const codigo = texto(item, 64);
    if (!CODIGO.test(codigo)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    return codigo;
  });
  semDuplicidade(permissoes);
  const controlesLidos = objeto(lido.controles_recurso);
  if (Object.keys(controlesLidos).length > 200) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const controles: Record<string, boolean> = {};
  for (const [codigo, estado] of Object.entries(controlesLidos)) {
    if (!CODIGO.test(codigo) || typeof estado !== 'boolean') {
      throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
    controles[codigo] = estado;
  }
  const politicas = lista(lido.politicas_versao, 2, normalizarPolitica);
  semDuplicidade(politicas.map(({ plataforma }) => plataforma));
  const sequenciaBase = sequencia(lido.sequencia_base);
  const versaoPermissoes = inteiro(lido.versao_permissoes);
  if (versaoPermissoes < 1) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  return {
    atendimentos,
    autorizacaoOffline: texto(lido.autorizacao_offline, 4_096),
    autorizacaoOfflineValidaAte: instante(lido.autorizacao_offline_valida_ate),
    controlesRecurso: controles,
    conversas,
    filas,
    geradoEm: instante(lido.gerado_em),
    mensagensRecentes: mensagens,
    notasInternasRecentes: notas,
    permissoes,
    politicasVersao: politicas,
    sequenciaBase,
    versaoPermissoes,
  };
}

export function normalizarEventoMobile(valor: unknown): EventoSincronizacaoMobile {
  const lido = objeto(valor);
  chavesExatas(
    lido,
    [
      'audiencia',
      'dados',
      'entidadeId',
      'entidadeTipo',
      'ocorridoEm',
      'politicaCache',
      'sequenciaEvento',
      'tipo',
    ],
    ['atendimentoId', 'conversaId'],
  );
  if (
    lido.audiencia !== 'MOBILE' ||
    (lido.politicaCache !== 'OPERACIONAL' && lido.politicaCache !== 'PROTEGIDO')
  ) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const tipo = enumeracao(lido.tipo, TIPOS_EVENTO);
  const entidadeTipo = texto(lido.entidadeTipo, 64);
  if (!CODIGO.test(entidadeTipo)) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  const dadosLidos = objeto(lido.dados);
  if (Object.keys(dadosLidos).length > CHAVES_DADOS_EVENTO.size) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const dados: Record<string, boolean | number | string | null> = {};
  for (const [chave, item] of Object.entries(dadosLidos)) {
    if (
      !CHAVES_DADOS_EVENTO.has(chave) ||
      !(
        item === null ||
        typeof item === 'boolean' ||
        (typeof item === 'string' && item.length <= 2_048) ||
        (typeof item === 'number' && Number.isSafeInteger(item))
      )
    ) {
      throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
    dados[chave] = item;
  }
  return {
    ...(lido.atendimentoId === undefined
      ? {}
      : { atendimentoId: uuid(lido.atendimentoId) }),
    audiencia: 'MOBILE',
    ...(lido.conversaId === undefined ? {} : { conversaId: uuid(lido.conversaId) }),
    dados,
    entidadeId: uuid(lido.entidadeId),
    entidadeTipo,
    ocorridoEm: instante(lido.ocorridoEm),
    politicaCache: lido.politicaCache,
    sequenciaEvento: sequencia(lido.sequenciaEvento),
    tipo,
  };
}

export function normalizarLoteMobile(
  valor: unknown,
  cursorAtual: string,
): LoteSincronizacaoMobile {
  const lido = objeto(valor);
  chavesExatas(lido, ['eventos', 'sequencia_final', 'tem_mais']);
  if (typeof lido.tem_mais !== 'boolean') {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  const atual = BigInt(sequencia(cursorAtual));
  const final = BigInt(sequencia(lido.sequencia_final));
  if (final < atual) throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  const eventos = lista(lido.eventos, 100, normalizarEventoMobile);
  let anterior = atual;
  for (const evento of eventos) {
    const sequenciaEvento = BigInt(evento.sequenciaEvento);
    if (sequenciaEvento <= anterior || sequenciaEvento > final) {
      throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
    }
    anterior = sequenciaEvento;
  }
  if (lido.tem_mais && final === atual) {
    throw new Error('CONTRATO_SINCRONIZACAO_INVALIDO');
  }
  return {
    eventos,
    sequenciaFinal: final.toString(),
    temMais: lido.tem_mais,
  };
}
