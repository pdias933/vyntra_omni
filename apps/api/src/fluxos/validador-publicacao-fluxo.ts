import { Injectable } from '@nestjs/common';

import {
  TIPOS_NO_FLUXO,
  TIPOS_REFERENCIA_FLUXO,
  TIPOS_VARIAVEL_FLUXO,
  type ConexaoDefinicaoFluxo,
  type ContextoValidacaoPublicacaoFluxo,
  type DefinicaoFluxoV1,
  type NoDefinicaoFluxo,
  type ProblemaValidacaoFluxo,
  type ReferenciaAtivaFluxo,
  type ReferenciaNoFluxo,
  type RelatorioValidacaoFluxo,
  type TipoNoFluxo,
  type TipoReferenciaFluxo,
  type TipoVariavelFluxo,
  type VariavelDefinicaoFluxo,
} from './modelo-validacao-fluxo.js';
import {
  ehOperadorCondicaoFluxo,
  operadorCompativelComTipo,
  valorCompativelComTipo,
} from './valor-variavel-fluxo.js';

const IDENTIFICADOR = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAIDA = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CHAVES_PARAMETRO_PROIBIDAS = new Set([
  'codigo',
  'credencial',
  'endpoint',
  'headers',
  'script',
  'segredo',
  'senha',
  'shell',
  'sql',
  'token',
  'url',
]);
const TIPOS_NATIVOS = new Set<TipoNoFluxo>([
  'AGUARDAR',
  'CONDICAO',
  'DEFINIR_VARIAVEL',
  'FIM',
  'INICIO',
]);
const TIPOS_SAIDA_CLIENTE = new Set<TipoNoFluxo>([
  'ENVIAR_BOTOES_OU_LISTA',
  'ENVIAR_MENSAGEM',
]);

const SAIDAS_OBRIGATORIAS = Object.freeze({
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
  CONSULTAR_FATURAS: [
    'ENCONTRADA',
    'NAO_ENCONTRADA',
    'ERP_INDISPONIVEL',
    'FALHA',
  ],
  ENVIAR_FATURA: [
    'SUCESSO',
    'DADOS_INCOMPLETOS',
    'ERP_INDISPONIVEL',
    'FALHA',
  ],
  VERIFICAR_DESBLOQUEIO_CONFIANCA: [
    'ELEGIVEL',
    'NAO_ELEGIVEL',
    'INDISPONIVEL',
    'FALHA',
  ],
  EXECUTAR_DESBLOQUEIO_CONFIANCA: [
    'CONCLUIDO',
    'NAO_ELEGIVEL',
    'RESULTADO_INCERTO',
    'FALHA',
  ],
  CONSULTAR_SESSAO_ACESSO: [
    'ENCONTRADA',
    'NAO_ENCONTRADA',
    'INDISPONIVEL',
    'FALHA',
  ],
  CRIAR_ATENDIMENTO: [
    'CRIADO',
    'RESULTADO_INCERTO',
    'INDISPONIVEL',
    'FALHA',
  ],
  CRIAR_ORDEM_SERVICO: [
    'CRIADA',
    'RESULTADO_INCERTO',
    'INDISPONIVEL',
    'FALHA',
  ],
  TRANSFERIR_PARA_FILA: ['TRANSFERIDO', 'FALHA'],
  AGUARDAR_ATENDENTE: ['ATENDIDO', 'TIMEOUT', 'FALHA'],
  ENCERRAR_ATENDIMENTO: ['ENCERRADO', 'FALHA'],
} satisfies Readonly<Record<TipoNoFluxo, readonly string[]>>);

const REFERENCIAS_OBRIGATORIAS: Readonly<
  Partial<Record<TipoNoFluxo, readonly TipoReferenciaFluxo[]>>
> = Object.freeze({
  ENCERRAR_ATENDIMENTO: ['FILA'],
  SOLICITAR_FORMULARIO_WHATSAPP: ['FORMULARIO_WHATSAPP'],
  TRANSFERIR_PARA_FILA: ['FILA'],
  AGUARDAR_ATENDENTE: ['FILA'],
  HORARIO_ATENDIMENTO: ['CALENDARIO'],
});

@Injectable()
export class ValidadorPublicacaoFluxo {
  public validar(
    definicaoRecebida: unknown,
    contextoRecebido: unknown,
  ): RelatorioValidacaoFluxo {
    const problemas: ProblemaValidacaoFluxo[] = [];
    const definicao = this.lerDefinicao(definicaoRecebida, problemas);
    const contexto = this.lerContexto(contextoRecebido, problemas);
    if (definicao === undefined || contexto === undefined) {
      return {
        problemas,
        quantidadeConexoes: definicao?.conexoes.length ?? 0,
        quantidadeNos: definicao?.nos.length ?? 0,
        valido: false,
      };
    }

    const nosPorId = new Map(definicao.nos.map((no) => [no.id, no]));
    this.validarInicioEFim(definicao, nosPorId, problemas);
    this.validarConexoes(definicao, nosPorId, problemas);
    this.validarCapacidadesEReferencias(definicao, contexto, problemas);
    const alcancaveis = this.obterAlcancaveis(definicao, nosPorId);
    for (const no of definicao.nos) {
      if (!alcancaveis.has(no.id)) {
        this.adicionar(problemas, { codigo: 'NO_INALCANCAVEL', noId: no.id });
      }
    }
    this.validarVariaveis(definicao, alcancaveis, problemas);
    this.validarCiclos(definicao, alcancaveis, problemas);

    return {
      problemas,
      quantidadeConexoes: definicao.conexoes.length,
      quantidadeNos: definicao.nos.length,
      valido: problemas.length === 0,
    };
  }

  private lerDefinicao(
    valor: unknown,
    problemas: ProblemaValidacaoFluxo[],
  ): DefinicaoFluxoV1 | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, [
        'conexoes',
        'inicioNoId',
        'nos',
        'variaveis',
        'versaoSchema',
      ]) ||
      valor.versaoSchema !== 1 ||
      typeof valor.inicioNoId !== 'string' ||
      !IDENTIFICADOR.test(valor.inicioNoId) ||
      !Array.isArray(valor.nos) ||
      !Array.isArray(valor.conexoes) ||
      !Array.isArray(valor.variaveis) ||
      valor.nos.length < 2 ||
      valor.nos.length > 500 ||
      valor.conexoes.length > 2_000 ||
      valor.variaveis.length > 200
    ) {
      this.adicionar(problemas, { codigo: 'DEFINICAO_ESTRUTURAL_INVALIDA' });
      return undefined;
    }
    const nos = valor.nos.map((item) => this.lerNo(item));
    const conexoes = valor.conexoes.map((item) => this.lerConexao(item));
    const variaveis = valor.variaveis.map((item) => this.lerVariavel(item));
    if (
      nos.some((item) => item === undefined) ||
      conexoes.some((item) => item === undefined) ||
      variaveis.some((item) => item === undefined)
    ) {
      this.adicionar(problemas, { codigo: 'DEFINICAO_ESTRUTURAL_INVALIDA' });
      return undefined;
    }
    const nosValidos = nos.filter((item) => item !== undefined);
    const conexoesValidas = conexoes.filter((item) => item !== undefined);
    const variaveisValidas = variaveis.filter((item) => item !== undefined);
    if (
      new Set(nosValidos.map(({ id }) => id)).size !== nosValidos.length ||
      new Set(variaveisValidas.map(({ nome }) => nome)).size !==
        variaveisValidas.length
    ) {
      this.adicionar(problemas, { codigo: 'IDENTIFICADOR_DUPLICADO' });
      return undefined;
    }
    return {
      conexoes: conexoesValidas,
      inicioNoId: valor.inicioNoId,
      nos: nosValidos,
      variaveis: variaveisValidas,
      versaoSchema: 1,
    };
  }

  private lerNo(valor: unknown): NoDefinicaoFluxo | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, [
        'id',
        'limiteIteracoes',
        'parametros',
        'referencias',
        'tipo',
        'variaveisEntrada',
        'variaveisSaida',
      ]) ||
      typeof valor.id !== 'string' ||
      !IDENTIFICADOR.test(valor.id) ||
      typeof valor.tipo !== 'string' ||
      !this.ehTipoNo(valor.tipo) ||
      !this.ehListaIdentificadores(valor.variaveisEntrada) ||
      !this.ehListaIdentificadores(valor.variaveisSaida) ||
      !Array.isArray(valor.referencias) ||
      !this.ehRegistro(valor.parametros) ||
      !this.parametrosSaoSeguros(valor.parametros, 0) ||
      JSON.stringify(valor.parametros).length > 32_768 ||
      (valor.limiteIteracoes !== undefined &&
        (!Number.isInteger(valor.limiteIteracoes) ||
          typeof valor.limiteIteracoes !== 'number' ||
          valor.limiteIteracoes < 1 ||
          valor.limiteIteracoes > 100 ||
          ![
            'AGUARDAR',
            'CONDICAO',
            'DEFINIR_VARIAVEL',
            'HORARIO_ATENDIMENTO',
          ].includes(valor.tipo)))
    ) {
      return undefined;
    }
    const referencias = valor.referencias.map((item) =>
      this.lerReferencia(item),
    );
    if (
      referencias.some((item) => item === undefined) ||
      !this.parametrosNoSaoValidos(valor.tipo, valor.parametros)
    ) {
      return undefined;
    }
    return {
      id: valor.id,
      parametros: valor.parametros,
      referencias: referencias.filter((item) => item !== undefined),
      tipo: valor.tipo,
      variaveisEntrada: valor.variaveisEntrada,
      variaveisSaida: valor.variaveisSaida,
      ...(valor.limiteIteracoes === undefined
        ? {}
        : { limiteIteracoes: valor.limiteIteracoes }),
    };
  }

  private parametrosNoSaoValidos(
    tipo: TipoNoFluxo,
    parametros: Readonly<Record<string, unknown>>,
  ): boolean {
    if (tipo === 'ENVIAR_MENSAGEM') {
      return (
        this.temSomenteChaves(parametros, ['texto']) &&
        this.textoValido(parametros.texto, 4_096)
      );
    }
    if (tipo === 'ENVIAR_BOTOES_OU_LISTA') {
      if (
        !this.temSomenteChaves(parametros, ['opcoes', 'texto']) ||
        !this.textoValido(parametros.texto, 3_000) ||
        !Array.isArray(parametros.opcoes) ||
        parametros.opcoes.length < 1 ||
        parametros.opcoes.length > 10
      ) {
        return false;
      }
      const ids = new Set<string>();
      let tamanhoFallback = (parametros.texto as string).trim().length + 2;
      for (const item of parametros.opcoes) {
        if (
          !this.ehRegistro(item) ||
          !this.temSomenteChaves(item, ['descricao', 'id', 'titulo']) ||
          typeof item.id !== 'string' ||
          !/^[A-Za-z0-9_-]{1,64}$/u.test(item.id) ||
          ids.has(item.id) ||
          !this.textoValido(item.titulo, 80) ||
          (item.descricao !== undefined &&
            !this.textoValido(item.descricao, 120))
        ) {
          return false;
        }
        ids.add(item.id);
        tamanhoFallback +=
          String(ids.size).length +
          2 +
          item.titulo.trim().length +
          (typeof item.descricao === 'string'
            ? 3 + item.descricao.trim().length
            : 0) +
          1;
      }
      return tamanhoFallback <= 4_096;
    }
    if (tipo === 'CONDICAO') {
      return (
        this.temExatamenteChaves(parametros, [
          'operador',
          'valor',
          'variavel',
        ]) &&
        typeof parametros.variavel === 'string' &&
        IDENTIFICADOR.test(parametros.variavel) &&
        ehOperadorCondicaoFluxo(parametros.operador) &&
        ['boolean', 'number', 'string'].includes(typeof parametros.valor)
      );
    }
    if (tipo === 'DEFINIR_VARIAVEL') {
      return (
        this.temExatamenteChaves(parametros, ['valor', 'variavel']) &&
        typeof parametros.variavel === 'string' &&
        IDENTIFICADOR.test(parametros.variavel) &&
        ['boolean', 'number', 'string'].includes(typeof parametros.valor)
      );
    }
    if (tipo === 'AGUARDAR') {
      if (parametros.tipo === 'RESPOSTA') {
        return (
          this.temExatamenteChaves(parametros, [
            'tempoLimiteSegundos',
            'tipo',
          ]) &&
          typeof parametros.tempoLimiteSegundos === 'number' &&
          Number.isInteger(parametros.tempoLimiteSegundos) &&
          parametros.tempoLimiteSegundos >= 1 &&
          parametros.tempoLimiteSegundos <= 86_400
        );
      }
      if (parametros.tipo === 'ATE_INSTANTE') {
        const retomarEm = parametros.retomarEm;
        return (
          this.temExatamenteChaves(parametros, ['retomarEm', 'tipo']) &&
          typeof retomarEm === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
            retomarEm,
          ) &&
          Number.isFinite(Date.parse(retomarEm)) &&
          new Date(retomarEm).toISOString() === retomarEm
        );
      }
      return false;
    }
    if (tipo === 'HORARIO_ATENDIMENTO') {
      return this.temExatamenteChaves(parametros, []);
    }
    if (tipo === 'IDENTIFICAR_CONTATO') {
      return this.temExatamenteChaves(parametros, []);
    }
    if (tipo === 'SOLICITAR_DADOS_CONTATO') {
      return (
        this.temExatamenteChaves(parametros, ['textoFallback']) &&
        this.textoValido(parametros.textoFallback, 4_096)
      );
    }
    if (tipo === 'SELECIONAR_CLIENTE' || tipo === 'SELECIONAR_CONTRATO') {
      return (
        this.temExatamenteChaves(parametros, ['variavel']) &&
        typeof parametros.variavel === 'string' &&
        IDENTIFICADOR.test(parametros.variavel)
      );
    }
    if (tipo === 'CONSULTAR_FATURAS' || tipo === 'ENVIAR_FATURA') {
      return this.temExatamenteChaves(parametros, []);
    }
    if (tipo === 'INICIO' || tipo === 'FIM') {
      return this.temExatamenteChaves(parametros, []);
    }
    return true;
  }

  private textoValido(valor: unknown, limite: number): valor is string {
    return (
      typeof valor === 'string' &&
      !valor.includes('\u0000') &&
      valor.trim().length >= 1 &&
      valor.length <= limite
    );
  }

  private lerConexao(valor: unknown): ConexaoDefinicaoFluxo | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, [
        'destinoNoId',
        'origemNoId',
        'saida',
      ]) ||
      typeof valor.origemNoId !== 'string' ||
      !IDENTIFICADOR.test(valor.origemNoId) ||
      typeof valor.destinoNoId !== 'string' ||
      !IDENTIFICADOR.test(valor.destinoNoId) ||
      typeof valor.saida !== 'string' ||
      !SAIDA.test(valor.saida)
    ) {
      return undefined;
    }
    return {
      destinoNoId: valor.destinoNoId,
      origemNoId: valor.origemNoId,
      saida: valor.saida,
    };
  }

  private lerVariavel(valor: unknown): VariavelDefinicaoFluxo | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, [
        'disponivelNaEntrada',
        'nome',
        'sensivel',
        'tipo',
      ]) ||
      typeof valor.nome !== 'string' ||
      !IDENTIFICADOR.test(valor.nome) ||
      typeof valor.tipo !== 'string' ||
      !this.ehTipoVariavel(valor.tipo) ||
      typeof valor.sensivel !== 'boolean' ||
      typeof valor.disponivelNaEntrada !== 'boolean'
    ) {
      return undefined;
    }
    return {
      disponivelNaEntrada: valor.disponivelNaEntrada,
      nome: valor.nome,
      sensivel: valor.sensivel,
      tipo: valor.tipo,
    };
  }

  private lerReferencia(valor: unknown): ReferenciaNoFluxo | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, ['recursoId', 'tipo']) ||
      typeof valor.tipo !== 'string' ||
      !this.ehTipoReferencia(valor.tipo) ||
      typeof valor.recursoId !== 'string' ||
      !UUID.test(valor.recursoId)
    ) {
      return undefined;
    }
    return { recursoId: valor.recursoId, tipo: valor.tipo };
  }

  private lerContexto(
    valor: unknown,
    problemas: ProblemaValidacaoFluxo[],
  ): ContextoValidacaoPublicacaoFluxo | undefined {
    if (
      !this.ehRegistro(valor) ||
      !this.temSomenteChaves(valor, [
        'capacidadesHabilitadas',
        'referenciasAtivas',
      ]) ||
      !Array.isArray(valor.capacidadesHabilitadas) ||
      !Array.isArray(valor.referenciasAtivas) ||
      valor.capacidadesHabilitadas.some(
        (tipo) => typeof tipo !== 'string' || !this.ehTipoNo(tipo),
      )
    ) {
      this.adicionar(problemas, { codigo: 'CONTEXTO_VALIDACAO_INVALIDO' });
      return undefined;
    }
    const referencias = valor.referenciasAtivas.map((item) =>
      this.lerReferenciaAtiva(item),
    );
    if (referencias.some((item) => item === undefined)) {
      this.adicionar(problemas, { codigo: 'CONTEXTO_VALIDACAO_INVALIDO' });
      return undefined;
    }
    return {
      capacidadesHabilitadas: valor.capacidadesHabilitadas,
      referenciasAtivas: referencias.filter((item) => item !== undefined),
    };
  }

  private lerReferenciaAtiva(valor: unknown): ReferenciaAtivaFluxo | undefined {
    return this.lerReferencia(valor);
  }

  private validarInicioEFim(
    definicao: DefinicaoFluxoV1,
    nosPorId: ReadonlyMap<string, NoDefinicaoFluxo>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    const inicios = definicao.nos.filter(({ tipo }) => tipo === 'INICIO');
    if (
      inicios.length !== 1 ||
      inicios[0]?.id !== definicao.inicioNoId ||
      nosPorId.get(definicao.inicioNoId)?.tipo !== 'INICIO'
    ) {
      this.adicionar(problemas, { codigo: 'INICIO_INVALIDO' });
    }
    if (!definicao.nos.some(({ tipo }) => tipo === 'FIM')) {
      this.adicionar(problemas, { codigo: 'FIM_AUSENTE' });
    }
  }

  private validarConexoes(
    definicao: DefinicaoFluxoV1,
    nosPorId: ReadonlyMap<string, NoDefinicaoFluxo>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    const chaves = new Set<string>();
    for (const conexao of definicao.conexoes) {
      const origem = nosPorId.get(conexao.origemNoId);
      const destino = nosPorId.get(conexao.destinoNoId);
      if (origem === undefined || destino === undefined) {
        this.adicionar(problemas, {
          codigo: 'REFERENCIA_NO_INEXISTENTE',
          noId: origem === undefined ? conexao.origemNoId : conexao.destinoNoId,
        });
        continue;
      }
      if (origem.tipo === 'FIM' || destino.tipo === 'INICIO') {
        this.adicionar(problemas, {
          codigo: 'CONEXAO_ESTADO_INVALIDO',
          noId: origem.id,
        });
      }
      if (
        !SAIDAS_OBRIGATORIAS[origem.tipo].some(
          (saida) => saida === conexao.saida,
        )
      ) {
        this.adicionar(problemas, {
          codigo: 'SAIDA_NAO_SUPORTADA',
          noId: origem.id,
        });
      }
      const chave = `${origem.id}:${conexao.saida}`;
      if (chaves.has(chave)) {
        this.adicionar(problemas, {
          codigo: 'SAIDA_DUPLICADA',
          noId: origem.id,
        });
      }
      chaves.add(chave);
    }
    for (const no of definicao.nos) {
      const saidas = new Set(
        definicao.conexoes
          .filter(({ origemNoId }) => origemNoId === no.id)
          .map(({ saida }) => saida),
      );
      for (const saida of SAIDAS_OBRIGATORIAS[no.tipo]) {
        if (!saidas.has(saida)) {
          this.adicionar(problemas, {
            codigo: `SAIDA_${saida}_AUSENTE`,
            noId: no.id,
          });
        }
      }
    }
  }

  private validarCapacidadesEReferencias(
    definicao: DefinicaoFluxoV1,
    contexto: ContextoValidacaoPublicacaoFluxo,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    const capacidades = new Set(contexto.capacidadesHabilitadas);
    const referenciasAtivas = new Set(
      contexto.referenciasAtivas.map(
        ({ recursoId, tipo }) => `${tipo}:${recursoId}`,
      ),
    );
    for (const no of definicao.nos) {
      if (!TIPOS_NATIVOS.has(no.tipo) && !capacidades.has(no.tipo)) {
        this.adicionar(problemas, {
          codigo: 'CAPACIDADE_NAO_HABILITADA',
          noId: no.id,
        });
      }
      for (const referencia of no.referencias) {
        if (!referenciasAtivas.has(`${referencia.tipo}:${referencia.recursoId}`)) {
          this.adicionar(problemas, {
            codigo: 'REFERENCIA_INATIVA',
            noId: no.id,
            referenciaId: referencia.recursoId,
          });
        }
      }
      for (const tipoObrigatorio of REFERENCIAS_OBRIGATORIAS[no.tipo] ?? []) {
        if (!no.referencias.some(({ tipo }) => tipo === tipoObrigatorio)) {
          this.adicionar(problemas, {
            codigo: `REFERENCIA_${tipoObrigatorio}_AUSENTE`,
            noId: no.id,
          });
        }
      }
    }
  }

  private obterAlcancaveis(
    definicao: DefinicaoFluxoV1,
    nosPorId: ReadonlyMap<string, NoDefinicaoFluxo>,
  ): ReadonlySet<string> {
    if (!nosPorId.has(definicao.inicioNoId)) return new Set();
    const alcancaveis = new Set<string>();
    const pendentes = [definicao.inicioNoId];
    while (pendentes.length > 0) {
      const atual = pendentes.pop();
      if (atual === undefined || alcancaveis.has(atual)) continue;
      alcancaveis.add(atual);
      for (const conexao of definicao.conexoes) {
        if (
          conexao.origemNoId === atual &&
          nosPorId.has(conexao.destinoNoId) &&
          !alcancaveis.has(conexao.destinoNoId)
        ) {
          pendentes.push(conexao.destinoNoId);
        }
      }
    }
    return alcancaveis;
  }

  private validarVariaveis(
    definicao: DefinicaoFluxoV1,
    alcancaveis: ReadonlySet<string>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    const variaveis = new Map(definicao.variaveis.map((item) => [item.nome, item]));
    const definidasPorNos = new Set(
      definicao.nos.flatMap(({ variaveisSaida }) => variaveisSaida),
    );
    for (const no of definicao.nos) {
      this.validarNoDeVariavel(no, variaveis, problemas);
      this.validarNoEsperaOuCalendario(no, problemas);
      this.validarNoIdentidade(no, variaveis, problemas);
      this.validarNoFatura(no, problemas);
      for (const nome of [...no.variaveisEntrada, ...no.variaveisSaida]) {
        if (!variaveis.has(nome)) {
          this.adicionar(problemas, {
            codigo: 'VARIAVEL_NAO_DECLARADA',
            noId: no.id,
            variavel: nome,
          });
        }
      }
      if (TIPOS_SAIDA_CLIENTE.has(no.tipo)) {
        for (const nome of no.variaveisEntrada) {
          if (variaveis.get(nome)?.sensivel === true) {
            this.adicionar(problemas, {
              codigo: 'DADO_SENSIVEL_EM_SAIDA_CLIENTE',
              noId: no.id,
              variavel: nome,
            });
          }
        }
      }
    }
    for (const variavel of definicao.variaveis) {
      if (!variavel.disponivelNaEntrada && !definidasPorNos.has(variavel.nome)) {
        this.adicionar(problemas, {
          codigo: 'VARIAVEL_SEM_ORIGEM',
          variavel: variavel.nome,
        });
      }
    }

    const universo = new Set(definicao.variaveis.map(({ nome }) => nome));
    const entradaInicial = new Set(
      definicao.variaveis
        .filter(({ disponivelNaEntrada }) => disponivelNaEntrada)
        .map(({ nome }) => nome),
    );
    const entradas = new Map<string, Set<string>>();
    const saidas = new Map<string, Set<string>>();
    for (const no of definicao.nos) {
      entradas.set(
        no.id,
        new Set(no.id === definicao.inicioNoId ? entradaInicial : universo),
      );
      saidas.set(no.id, new Set(universo));
    }
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const no of definicao.nos) {
        if (!alcancaveis.has(no.id)) continue;
        const predecessores = definicao.conexoes
          .filter(({ destinoNoId }) => destinoNoId === no.id)
          .map(({ origemNoId }) => origemNoId)
          .filter((id) => alcancaveis.has(id));
        const novaEntrada =
          no.id === definicao.inicioNoId
            ? new Set(entradaInicial)
            : this.intersecao(
                predecessores.map((id) => saidas.get(id) ?? new Set()),
              );
        const novaSaida = new Set([...novaEntrada, ...no.variaveisSaida]);
        if (!this.conjuntosIguais(entradas.get(no.id) ?? new Set(), novaEntrada)) {
          entradas.set(no.id, novaEntrada);
          mudou = true;
        }
        if (!this.conjuntosIguais(saidas.get(no.id) ?? new Set(), novaSaida)) {
          saidas.set(no.id, novaSaida);
          mudou = true;
        }
      }
    }
    for (const no of definicao.nos) {
      if (!alcancaveis.has(no.id)) continue;
      const disponiveis = entradas.get(no.id) ?? new Set();
      for (const nome of no.variaveisEntrada) {
        if (variaveis.has(nome) && !disponiveis.has(nome)) {
          this.adicionar(problemas, {
            codigo: 'VARIAVEL_NAO_DEFINIDA_NO_CAMINHO',
            noId: no.id,
            variavel: nome,
          });
        }
      }
    }
  }

  private validarNoEsperaOuCalendario(
    no: NoDefinicaoFluxo,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    if (no.tipo === 'AGUARDAR') {
      if (
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        this.adicionar(problemas, {
          codigo: 'CONFIGURACAO_ESPERA_INVALIDA',
          noId: no.id,
        });
      }
      return;
    }
    if (no.tipo !== 'HORARIO_ATENDIMENTO') return;
    if (
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0 ||
      no.referencias.length !== 1 ||
      no.referencias[0]?.tipo !== 'CALENDARIO'
    ) {
      this.adicionar(problemas, {
        codigo: 'CONFIGURACAO_CALENDARIO_INVALIDA',
        noId: no.id,
      });
    }
  }

  private validarNoDeVariavel(
    no: NoDefinicaoFluxo,
    variaveis: ReadonlyMap<string, VariavelDefinicaoFluxo>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    if (no.tipo !== 'CONDICAO' && no.tipo !== 'DEFINIR_VARIAVEL') return;
    const nome = Reflect.get(no.parametros, 'variavel');
    const valor = Reflect.get(no.parametros, 'valor');
    const variavel = typeof nome === 'string' ? variaveis.get(nome) : undefined;
    const listasCoerentes =
      typeof nome === 'string' &&
      (no.tipo === 'CONDICAO'
        ? no.variaveisEntrada.length === 1 &&
          no.variaveisEntrada[0] === nome &&
          no.variaveisSaida.length === 0
        : no.variaveisEntrada.length === 0 &&
          no.variaveisSaida.length === 1 &&
          no.variaveisSaida[0] === nome);
    const operador = Reflect.get(no.parametros, 'operador');
    const configuracaoValida =
      variavel !== undefined &&
      listasCoerentes &&
      valorCompativelComTipo(variavel.tipo, valor) &&
      (no.tipo === 'CONDICAO'
        ? ehOperadorCondicaoFluxo(operador) &&
          operadorCompativelComTipo(variavel.tipo, operador)
        : variavel.sensivel === false);
    if (!configuracaoValida) {
      this.adicionar(problemas, {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        noId: no.id,
        ...(typeof nome === 'string' ? { variavel: nome } : {}),
      });
    }
  }

  private validarNoIdentidade(
    no: NoDefinicaoFluxo,
    variaveis: ReadonlyMap<string, VariavelDefinicaoFluxo>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    if (
      no.tipo === 'IDENTIFICAR_CONTATO' ||
      no.tipo === 'SOLICITAR_DADOS_CONTATO'
    ) {
      if (
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        this.adicionar(problemas, {
          codigo: 'CONFIGURACAO_IDENTIDADE_INVALIDA',
          noId: no.id,
        });
      }
      return;
    }
    if (
      no.tipo !== 'SELECIONAR_CLIENTE' &&
      no.tipo !== 'SELECIONAR_CONTRATO'
    ) {
      return;
    }
    const nome = Reflect.get(no.parametros, 'variavel');
    const variavel = typeof nome === 'string' ? variaveis.get(nome) : undefined;
    if (
      typeof nome !== 'string' ||
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 1 ||
      no.variaveisEntrada[0] !== nome ||
      no.variaveisSaida.length !== 0 ||
      variavel?.tipo !== 'UUID' ||
      !variavel.sensivel
    ) {
      this.adicionar(problemas, {
        codigo: 'CONFIGURACAO_SELECAO_CONTEXTO_INVALIDA',
        noId: no.id,
        ...(typeof nome === 'string' ? { variavel: nome } : {}),
      });
    }
  }

  private validarNoFatura(
    no: NoDefinicaoFluxo,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    if (no.tipo !== 'CONSULTAR_FATURAS' && no.tipo !== 'ENVIAR_FATURA') {
      return;
    }
    if (
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      this.adicionar(problemas, {
        codigo: 'CONFIGURACAO_FATURA_INVALIDA',
        noId: no.id,
      });
    }
  }

  private validarCiclos(
    definicao: DefinicaoFluxoV1,
    alcancaveis: ReadonlySet<string>,
    problemas: ProblemaValidacaoFluxo[],
  ): void {
    for (const componente of this.obterComponentesFortementeConectados(
      definicao,
      alcancaveis,
    )) {
      const conjunto = new Set(componente);
      const autoCiclo = definicao.conexoes.some(
        ({ destinoNoId, origemNoId }) =>
          destinoNoId === origemNoId && conjunto.has(origemNoId),
      );
      if (componente.length < 2 && !autoCiclo) continue;
      const noCicloId = componente[0];
      if (noCicloId === undefined) continue;
      const nos = definicao.nos.filter(({ id }) => conjunto.has(id));
      const limitados = nos.filter(
        ({ limiteIteracoes }) => limiteIteracoes !== undefined,
      );
      const naoLimitados = new Set(
        nos
          .filter(({ limiteIteracoes }) => limiteIteracoes === undefined)
          .map(({ id }) => id),
      );
      if (
        limitados.length === 0 ||
        this.temCicloNoSubgrafo(definicao, naoLimitados)
      ) {
        this.adicionar(problemas, {
          codigo: 'CICLO_SEM_LIMITE',
          noId: noCicloId,
        });
      }
      for (const noLimitado of limitados) {
        const falhaSaiDoCiclo = definicao.conexoes.some(
          ({ destinoNoId, origemNoId, saida }) =>
            origemNoId === noLimitado.id &&
            saida === 'FALHA' &&
            !conjunto.has(destinoNoId),
        );
        if (!falhaSaiDoCiclo) {
          this.adicionar(problemas, {
            codigo: 'LIMITE_ITERACOES_SEM_SAIDA',
            noId: noLimitado.id,
          });
        }
      }
      if (
        !definicao.conexoes.some(
          ({ destinoNoId, origemNoId }) =>
            conjunto.has(origemNoId) && !conjunto.has(destinoNoId),
        )
      ) {
        this.adicionar(problemas, {
          codigo: 'CICLO_SEM_SAIDA',
          noId: noCicloId,
        });
      }
    }
  }

  private temCicloNoSubgrafo(
    definicao: DefinicaoFluxoV1,
    nos: ReadonlySet<string>,
  ): boolean {
    if (nos.size === 0) return false;
    return this.obterComponentesFortementeConectados(definicao, nos).some(
      (componente) =>
        componente.length > 1 ||
        definicao.conexoes.some(
          ({ destinoNoId, origemNoId }) =>
            componente[0] !== undefined &&
            origemNoId === componente[0] &&
            destinoNoId === componente[0],
        ),
    );
  }

  private obterComponentesFortementeConectados(
    definicao: DefinicaoFluxoV1,
    alcancaveis: ReadonlySet<string>,
  ): readonly (readonly string[])[] {
    let indice = 0;
    const indices = new Map<string, number>();
    const menores = new Map<string, number>();
    const pilha: string[] = [];
    const naPilha = new Set<string>();
    const componentes: string[][] = [];
    const visitar = (id: string): void => {
      indices.set(id, indice);
      menores.set(id, indice);
      indice += 1;
      pilha.push(id);
      naPilha.add(id);
      for (const destino of definicao.conexoes
        .filter(({ origemNoId }) => origemNoId === id)
        .map(({ destinoNoId }) => destinoNoId)
        .filter((destinoId) => alcancaveis.has(destinoId))) {
        if (!indices.has(destino)) {
          visitar(destino);
          menores.set(
            id,
            Math.min(
              menores.get(id) ?? 0,
              menores.get(destino) ?? Number.MAX_SAFE_INTEGER,
            ),
          );
        } else if (naPilha.has(destino)) {
          menores.set(
            id,
            Math.min(menores.get(id) ?? 0, indices.get(destino) ?? 0),
          );
        }
      }
      if (menores.get(id) !== indices.get(id)) return;
      const componente: string[] = [];
      let atual: string | undefined;
      do {
        atual = pilha.pop();
        if (atual !== undefined) {
          naPilha.delete(atual);
          componente.push(atual);
        }
      } while (atual !== id && atual !== undefined);
      componentes.push(componente);
    };
    for (const id of alcancaveis) {
      if (!indices.has(id)) visitar(id);
    }
    return componentes;
  }

  private parametrosSaoSeguros(valor: unknown, profundidade: number): boolean {
    if (profundidade > 10) return false;
    if (
      valor === null ||
      typeof valor === 'boolean' ||
      typeof valor === 'string'
    ) {
      return typeof valor !== 'string' || !/^javascript:/iu.test(valor.trim());
    }
    if (typeof valor === 'number') return Number.isFinite(valor);
    if (Array.isArray(valor)) {
      return valor.every((item) =>
        this.parametrosSaoSeguros(item, profundidade + 1),
      );
    }
    if (!this.ehRegistro(valor)) return false;
    return Object.entries(valor).every(
      ([chave, item]) =>
        !CHAVES_PARAMETRO_PROIBIDAS.has(chave.toLocaleLowerCase('pt-BR')) &&
        this.parametrosSaoSeguros(item, profundidade + 1),
    );
  }

  private ehListaIdentificadores(valor: unknown): valor is readonly string[] {
    return (
      Array.isArray(valor) &&
      valor.length <= 50 &&
      valor.every((item) => typeof item === 'string' && IDENTIFICADOR.test(item)) &&
      new Set(valor).size === valor.length
    );
  }

  private ehTipoNo(valor: string): valor is TipoNoFluxo {
    return TIPOS_NO_FLUXO.some((tipo) => tipo === valor);
  }

  private ehTipoVariavel(valor: string): valor is TipoVariavelFluxo {
    return TIPOS_VARIAVEL_FLUXO.some((tipo) => tipo === valor);
  }

  private ehTipoReferencia(valor: string): valor is TipoReferenciaFluxo {
    return TIPOS_REFERENCIA_FLUXO.some((tipo) => tipo === valor);
  }

  private ehRegistro(valor: unknown): valor is Record<string, unknown> {
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  }

  private temSomenteChaves(
    valor: Readonly<Record<string, unknown>>,
    permitidas: readonly string[],
  ): boolean {
    const conjunto = new Set(permitidas);
    return Object.keys(valor).every((chave) => conjunto.has(chave));
  }

  private temExatamenteChaves(
    valor: Readonly<Record<string, unknown>>,
    esperadas: readonly string[],
  ): boolean {
    return (
      Object.keys(valor).length === esperadas.length &&
      this.temSomenteChaves(valor, esperadas)
    );
  }

  private intersecao(conjuntos: readonly ReadonlySet<string>[]): Set<string> {
    if (conjuntos.length === 0) return new Set();
    const primeiro = conjuntos[0];
    if (primeiro === undefined) return new Set();
    return new Set(
      [...primeiro].filter((item) =>
        conjuntos.slice(1).every((conjunto) => conjunto.has(item)),
      ),
    );
  }

  private conjuntosIguais(
    primeiro: ReadonlySet<string>,
    segundo: ReadonlySet<string>,
  ): boolean {
    return (
      primeiro.size === segundo.size &&
      [...primeiro].every((item) => segundo.has(item))
    );
  }

  private adicionar(
    problemas: ProblemaValidacaoFluxo[],
    problema: ProblemaValidacaoFluxo,
  ): void {
    if (problemas.length < 100) problemas.push(problema);
  }
}
