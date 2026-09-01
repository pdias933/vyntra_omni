import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  ErroCalendarioAusente,
  ErroCalendarioInvalido,
} from '../calendarios/erros-calendario.js';
import { ServicoCalendarios } from '../calendarios/servico-calendarios.js';
import { ServicoContextosCliente } from '../contextos-cliente/servico-contextos-cliente.js';
import type {
  ConexaoDefinicaoFluxo,
  DefinicaoFluxoV1,
  NoDefinicaoFluxo,
  VariavelDefinicaoFluxo,
} from '../fluxos/modelo-validacao-fluxo.js';
import { ServicoCatalogoFluxos } from '../fluxos/servico-catalogo-fluxos.js';
import {
  avaliarCondicaoTipada,
  ehOperadorCondicaoFluxo,
  valorCompativelComTipo,
} from '../fluxos/valor-variavel-fluxo.js';
import { ServicoMensagensSaida } from '../mensagens/servico-mensagens-saida.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import {
  agendarEsperaFluxo,
  lerEsperaFluxo,
  removerEsperaFluxo,
} from './contexto-espera-execucao-fluxo.js';
import {
  definirValorVariavelExecucao,
  lerValorVariavelExecucao,
  registrarIteracaoNoFluxo,
} from './contexto-variaveis-execucao-fluxo.js';
import {
  ErroConflitoExecucaoFluxo,
  ErroExecucaoFluxoInvalida,
} from './erros-execucao-fluxo.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';
import type {
  PassoExecucaoFluxoPersistido,
  ResultadoNoMensagemFluxo,
} from './modelo-passo-execucao-fluxo.js';
import {
  REPOSITORIO_EXECUCOES_FLUXO,
  type RepositorioExecucoesFluxo,
} from './repositorio-execucoes-fluxo.js';
import {
  REPOSITORIO_PASSOS_EXECUCAO_FLUXO,
  type RepositorioPassosExecucaoFluxo,
} from './repositorio-passos-execucao-fluxo.js';
import { ServicoExecucoesFluxo } from './servico-execucoes-fluxo.js';

const TIPOS_SUPORTADOS = new Set([
  'AGUARDAR',
  'CONDICAO',
  'DEFINIR_VARIAVEL',
  'ENVIAR_BOTOES_OU_LISTA',
  'ENVIAR_MENSAGEM',
  'FIM',
  'HORARIO_ATENDIMENTO',
  'IDENTIFICAR_CONTATO',
  'INICIO',
  'SELECIONAR_CLIENTE',
  'SELECIONAR_CONTRATO',
  'SOLICITAR_DADOS_CONTATO',
]);

interface ResultadoExecucaoNo {
  readonly resultado: string;
  readonly agendamento?: {
    readonly estadoEspera:
      | 'AGUARDANDO_RESPOSTA'
      | 'AGUARDANDO_SISTEMA';
    readonly retomarEm: Date;
  };
  readonly codigo?: string | undefined;
  readonly contextoProtegido?: ObjetoJsonProtegido | undefined;
  readonly mensagem?: { readonly id: string } | undefined;
}

@Injectable()
export class ServicoExecutorNosFluxo {
  public constructor(
    @Inject(REPOSITORIO_EXECUCOES_FLUXO)
    private readonly repositorioExecucoes: RepositorioExecucoesFluxo,
    @Inject(REPOSITORIO_PASSOS_EXECUCAO_FLUXO)
    private readonly repositorioPassos: RepositorioPassosExecucaoFluxo,
    @Inject(ServicoCatalogoFluxos)
    private readonly catalogo: ServicoCatalogoFluxos,
    @Inject(ServicoCalendarios)
    private readonly calendarios: ServicoCalendarios,
    @Inject(ServicoContextosCliente)
    private readonly contextosCliente: ServicoContextosCliente,
    @Inject(ServicoMensagensSaida)
    private readonly mensagens: ServicoMensagensSaida,
    @Inject(ServicoExecucoesFluxo)
    private readonly execucoes: ServicoExecucoesFluxo,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
  ) {}

  public async executarCiclo(
    limite = 50,
    relogio: () => Date = () => new Date(),
  ): Promise<number> {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new ErroExecucaoFluxoInvalida();
    }
    let processadas = 0;
    while (processadas < limite) {
      let selecionada: ExecucaoFluxoPersistida | undefined;
      try {
        const encontrou = await this.prisma.executarTransacao(
          async (transacao) => {
            const [execucao] =
              await this.repositorioExecucoes.listarProntasParaExecutar(
                1,
                transacao,
              );
            selecionada = execucao;
            if (execucao === undefined) return false;
            await this.executarNo(execucao, transacao, relogio);
            return true;
          },
        );
        if (!encontrou) break;
      } catch (erro) {
        if (
          !(erro instanceof ErroExecucaoFluxoInvalida) ||
          selecionada === undefined
        ) {
          throw erro;
        }
        await this.falharDefinicaoInvalida(selecionada, relogio);
      }
      processadas += 1;
    }
    return processadas;
  }

  private async falharDefinicaoInvalida(
    selecionada: ExecucaoFluxoPersistida,
    relogio: () => Date,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      const atual = await this.repositorioExecucoes.obterPorId(
        selecionada.id,
        transacao,
      );
      if (
        atual === undefined ||
        atual.estado !== 'EXECUTANDO' ||
        atual.revisao !== selecionada.revisao
      ) {
        return;
      }
      await this.execucoes.transitar(
        {
          comando: { codigo: 'DEFINICAO_FLUXO_INVALIDA', tipo: 'FALHAR' },
          execucaoFluxoId: atual.id,
          revisaoEsperada: atual.revisao,
        },
        transacao,
        relogio,
      );
    });
  }

  private async executarNo(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<void> {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime()) || agora < execucao.atualizadaEm) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const versao = await this.catalogo.obterVersaoFixaExecucao(
      execucao.versaoFluxoId,
      execucao.fluxoId,
      transacao,
    );
    const definicao = this.lerDefinicao(versao.definicao);
    const no = definicao.nos.find(({ id }) => id === execucao.noAtualId);
    if (no === undefined || !TIPOS_SUPORTADOS.has(no.tipo)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const passo: PassoExecucaoFluxoPersistido = {
      entradaSanitizada: { tipoNo: no.tipo },
      estado: 'INICIADO',
      execucaoFluxoId: execucao.id,
      id: randomUUID(),
      iniciadoEm: agora,
      noId: no.id,
      revisaoExecucao: execucao.revisao,
      tipoNo: no.tipo,
    };
    if (!(await this.repositorioPassos.iniciar(passo, transacao))) {
      throw new ErroConflitoExecucaoFluxo();
    }

    if (no.tipo === 'FIM') {
      await this.finalizarPasso(
        passo,
        { resultado: 'CONCLUIDO' },
        undefined,
        agora,
        transacao,
      );
      await this.execucoes.transitar(
        {
          comando: { tipo: 'CONCLUIR' },
          execucaoFluxoId: execucao.id,
          revisaoEsperada: execucao.revisao,
        },
        transacao,
        () => agora,
      );
      return;
    }

    const resultado = await this.executarOperacaoNo(
      no,
      definicao,
      execucao,
      transacao,
      relogio,
    );
    if (resultado.agendamento !== undefined) {
      await this.finalizarPasso(
        passo,
        { resultado: 'AGENDADO' },
        undefined,
        agora,
        transacao,
      );
      await this.execucoes.agendarRetomada(
        {
          contextoProtegido:
            resultado.contextoProtegido ?? execucao.contextoProtegido,
          estadoEspera: resultado.agendamento.estadoEspera,
          execucaoFluxoId: execucao.id,
          retomarEm: resultado.agendamento.retomarEm,
          revisaoEsperada: execucao.revisao,
        },
        transacao,
        () => agora,
      );
      return;
    }
    const saida = this.validarSaida(no, resultado.resultado);
    const destino = this.obterDestino(definicao.conexoes, no.id, saida);
    const codigo = resultado.codigo;
    const mensagemId = resultado.mensagem?.id;
    await this.finalizarPasso(
      passo,
      {
        ...(mensagemId === undefined ? {} : { mensagemId }),
        resultado: saida,
      },
      codigo,
      agora,
      transacao,
    );
    await this.execucoes.avancarNo(
      {
        ...(resultado.contextoProtegido === undefined
          ? {}
          : { contextoProtegido: resultado.contextoProtegido }),
        execucaoFluxoId: execucao.id,
        proximoNoId: destino,
        revisaoEsperada: execucao.revisao,
      },
      transacao,
      () => agora,
    );
  }

  private async executarOperacaoNo(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    if (no.tipo === 'AGUARDAR') {
      return this.executarEspera(no, execucao, relogio);
    }
    const iteracao = registrarIteracaoNoFluxo(
      execucao.contextoProtegido,
      no.id,
      no.limiteIteracoes,
    );
    if (!iteracao.valido) {
      return {
        codigo: 'CONTEXTO_ITERACOES_INVALIDO',
        resultado: 'FALHA',
      };
    }
    if (iteracao.excedeu) {
      return {
        codigo: 'LIMITE_ITERACOES_EXCEDIDO',
        contextoProtegido: iteracao.contexto,
        resultado: 'FALHA',
      };
    }
    if (no.tipo === 'INICIO') return { resultado: 'SUCESSO' };
    if (
      no.tipo === 'ENVIAR_MENSAGEM' ||
      no.tipo === 'ENVIAR_BOTOES_OU_LISTA'
    ) {
      return this.executarMensagem(no, execucao, transacao, relogio);
    }
    if (no.tipo === 'DEFINIR_VARIAVEL') {
      return this.definirVariavel(no, definicao, iteracao.contexto);
    }
    if (no.tipo === 'CONDICAO') {
      return this.avaliarCondicao(no, definicao, iteracao.contexto);
    }
    if (no.tipo === 'HORARIO_ATENDIMENTO') {
      return this.avaliarHorarioAtendimento(
        no,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    if (
      no.tipo === 'IDENTIFICAR_CONTATO' ||
      no.tipo === 'SELECIONAR_CLIENTE' ||
      no.tipo === 'SELECIONAR_CONTRATO' ||
      no.tipo === 'SOLICITAR_DADOS_CONTATO'
    ) {
      return this.executarIdentidade(
        no,
        definicao,
        execucao,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    throw new ErroExecucaoFluxoInvalida();
  }

  private async executarIdentidade(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    execucao: ExecucaoFluxoPersistida,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    if (no.tipo === 'IDENTIFICAR_CONTATO') {
      if (
        !this.temExatamenteChaves(no.parametros, []) ||
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        return {
          codigo: 'CONFIGURACAO_IDENTIDADE_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      return {
        contextoProtegido: contexto,
        resultado: (await this.contextosCliente.identificarParaFluxo(
          execucao.atendimentoId,
          transacao,
        ))
          ? 'IDENTIFICADO'
          : 'NAO_IDENTIFICADO',
      };
    }
    if (no.tipo === 'SOLICITAR_DADOS_CONTATO') {
      const textoFallback = Reflect.get(no.parametros, 'textoFallback');
      if (
        !this.temExatamenteChaves(no.parametros, ['textoFallback']) ||
        typeof textoFallback !== 'string' ||
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        return {
          codigo: 'CONFIGURACAO_IDENTIDADE_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      const resultado = await this.mensagens.criarAutomatica(
        {
          atendimentoId: execucao.atendimentoId,
          execucaoFluxoId: execucao.id,
          revisaoExecucao: execucao.revisao,
          texto: textoFallback,
          tipo: 'TEXTO',
        },
        transacao,
        relogio,
      );
      if (!('codigo' in resultado)) {
        return {
          contextoProtegido: contexto,
          ...(resultado.mensagem === undefined
            ? {}
            : { mensagem: resultado.mensagem }),
          resultado: 'FALLBACK',
        };
      }
      return {
        codigo: resultado.codigo,
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const variavel = this.obterVariavelDoNo(no, definicao, 'ENTRADA');
    if (
      variavel?.tipo !== 'UUID' ||
      !variavel.sensivel ||
      no.referencias.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_SELECAO_CONTEXTO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const vinculoId = lerValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
    );
    if (typeof vinculoId !== 'string') {
      return {
        contextoProtegido: contexto,
        resultado: 'NAO_SELECIONADO',
      };
    }
    const ator = {
      atendimentoId: execucao.atendimentoId,
      fluxoId: execucao.fluxoId,
      versaoFluxoId: execucao.versaoFluxoId,
    };
    const selecionado =
      no.tipo === 'SELECIONAR_CLIENTE'
        ? await this.contextosCliente.selecionarClientePorFluxo(
            { ...ator, vinculoClienteId: vinculoId },
            transacao,
            relogio,
          )
        : await this.contextosCliente.selecionarContratoPorFluxo(
            { ...ator, vinculoContratoId: vinculoId },
            transacao,
            relogio,
          );
    return {
      contextoProtegido: contexto,
      resultado: selecionado ? 'SELECIONADO' : 'NAO_SELECIONADO',
    };
  }

  private executarEspera(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    relogio: () => Date,
  ): ResultadoExecucaoNo {
    const configuracao = this.lerConfiguracaoEspera(no);
    if (configuracao === undefined) {
      return { codigo: 'CONFIGURACAO_ESPERA_INVALIDA', resultado: 'FALHA' };
    }
    const existente = lerEsperaFluxo(execucao.contextoProtegido, no.id);
    if (existente.estado === 'INVALIDA') {
      return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime()) || agora < execucao.atualizadaEm) {
      throw new ErroExecucaoFluxoInvalida();
    }
    if (existente.estado === 'PRESENTE') {
      const retomarEm = new Date(existente.espera.retomarEm);
      const coerenteComDefinicao =
        existente.espera.tipo === configuracao.tipo &&
        (configuracao.tipo !== 'ATE_INSTANTE' ||
          configuracao.retomarEm.toISOString() ===
            existente.espera.retomarEm);
      if (!coerenteComDefinicao) {
        return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
      }
      if (!existente.espera.respostaRecebida && agora < retomarEm) {
        return { codigo: 'RETOMADA_ESPERA_PREMATURA', resultado: 'FALHA' };
      }
      const contexto = removerEsperaFluxo(execucao.contextoProtegido, no.id);
      if (contexto === undefined) {
        return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
      }
      return {
        contextoProtegido: contexto,
        resultado:
          configuracao.tipo === 'RESPOSTA' &&
          !existente.espera.respostaRecebida
            ? 'TIMEOUT'
            : 'CONCLUIDO',
      };
    }

    const iteracao = registrarIteracaoNoFluxo(
      execucao.contextoProtegido,
      no.id,
      no.limiteIteracoes,
    );
    if (!iteracao.valido) {
      return { codigo: 'CONTEXTO_ITERACOES_INVALIDO', resultado: 'FALHA' };
    }
    if (iteracao.excedeu) {
      return {
        codigo: 'LIMITE_ITERACOES_EXCEDIDO',
        contextoProtegido: iteracao.contexto,
        resultado: 'FALHA',
      };
    }
    const retomarEm =
      configuracao.tipo === 'ATE_INSTANTE'
        ? configuracao.retomarEm
        : new Date(agora.getTime() + configuracao.tempoLimiteSegundos * 1_000);
    if (retomarEm <= agora) {
      return { contextoProtegido: iteracao.contexto, resultado: 'CONCLUIDO' };
    }
    const contexto = agendarEsperaFluxo(
      iteracao.contexto,
      no.id,
      configuracao.tipo,
      retomarEm,
    );
    if (contexto === undefined) {
      return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
    }
    return {
      agendamento: {
        estadoEspera:
          configuracao.tipo === 'RESPOSTA'
            ? 'AGUARDANDO_RESPOSTA'
            : 'AGUARDANDO_SISTEMA',
        retomarEm,
      },
      contextoProtegido: contexto,
      resultado: 'AGENDADO',
    };
  }

  private async avaliarHorarioAtendimento(
    no: NoDefinicaoFluxo,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    const referencia =
      no.referencias.length === 1 && no.referencias[0]?.tipo === 'CALENDARIO'
        ? no.referencias[0]
        : undefined;
    if (
      referencia === undefined ||
      Object.keys(no.parametros).length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_CALENDARIO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroExecucaoFluxoInvalida();
    try {
      const resultado = await this.calendarios.avaliar(
        referencia.recursoId,
        agora,
        transacao,
      );
      return {
        contextoProtegido: contexto,
        resultado:
          resultado.estado === 'ABERTO'
            ? 'DENTRO_HORARIO'
            : 'FORA_HORARIO',
      };
    } catch (erro) {
      if (erro instanceof ErroCalendarioAusente) {
        return {
          codigo: 'CALENDARIO_INDISPONIVEL',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      if (erro instanceof ErroCalendarioInvalido) {
        return {
          codigo: 'CALENDARIO_INVALIDO',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      throw erro;
    }
  }

  private lerConfiguracaoEspera(no: NoDefinicaoFluxo):
    | { readonly tipo: 'ATE_INSTANTE'; readonly retomarEm: Date }
    | {
        readonly tipo: 'RESPOSTA';
        readonly tempoLimiteSegundos: number;
      }
    | undefined {
    const tipo = Reflect.get(no.parametros, 'tipo');
    if (
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return undefined;
    }
    if (
      tipo === 'RESPOSTA' &&
      this.temExatamenteChaves(no.parametros, [
        'tempoLimiteSegundos',
        'tipo',
      ])
    ) {
      const tempo = Reflect.get(no.parametros, 'tempoLimiteSegundos');
      return typeof tempo === 'number' &&
        Number.isInteger(tempo) &&
        tempo >= 1 &&
        tempo <= 86_400
        ? { tempoLimiteSegundos: tempo, tipo }
        : undefined;
    }
    if (
      tipo === 'ATE_INSTANTE' &&
      this.temExatamenteChaves(no.parametros, ['retomarEm', 'tipo'])
    ) {
      const valor = Reflect.get(no.parametros, 'retomarEm');
      if (
        typeof valor !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(valor) ||
        !Number.isFinite(Date.parse(valor)) ||
        new Date(valor).toISOString() !== valor
      ) {
        return undefined;
      }
      return { retomarEm: new Date(valor), tipo };
    }
    return undefined;
  }

  private temExatamenteChaves(
    valor: Readonly<Record<string, unknown>>,
    chaves: readonly string[],
  ): boolean {
    return (
      Object.keys(valor).length === chaves.length &&
      Object.keys(valor).every((chave) => chaves.includes(chave))
    );
  }

  private definirVariavel(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    contexto: ObjetoJsonProtegido,
  ): ResultadoExecucaoNo {
    const variavel = this.obterVariavelDoNo(no, definicao, 'SAIDA');
    const valor = Reflect.get(no.parametros, 'valor');
    if (
      variavel === undefined ||
      variavel.sensivel ||
      !valorCompativelComTipo(variavel.tipo, valor)
    ) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const atualizado = definirValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
      valor,
    );
    if (atualizado === undefined) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    return { contextoProtegido: atualizado, resultado: 'SUCESSO' };
  }

  private avaliarCondicao(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    contexto: ObjetoJsonProtegido,
  ): ResultadoExecucaoNo {
    const variavel = this.obterVariavelDoNo(no, definicao, 'ENTRADA');
    const operador = Reflect.get(no.parametros, 'operador');
    const esperado = Reflect.get(no.parametros, 'valor');
    if (
      variavel === undefined ||
      !ehOperadorCondicaoFluxo(operador) ||
      !valorCompativelComTipo(variavel.tipo, esperado)
    ) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const atual = lerValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
    );
    if (atual === undefined) {
      return {
        codigo: 'VARIAVEL_INDISPONIVEL',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const resultado = avaliarCondicaoTipada(
      variavel.tipo,
      operador,
      atual,
      esperado,
    );
    return resultado === undefined
      ? {
          codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        }
      : {
          contextoProtegido: contexto,
          resultado: resultado ? 'VERDADEIRO' : 'FALSO',
        };
  }

  private obterVariavelDoNo(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    direcao: 'ENTRADA' | 'SAIDA',
  ): VariavelDefinicaoFluxo | undefined {
    const nome = Reflect.get(no.parametros, 'variavel');
    const nomes = direcao === 'ENTRADA' ? no.variaveisEntrada : no.variaveisSaida;
    const opostos = direcao === 'ENTRADA' ? no.variaveisSaida : no.variaveisEntrada;
    if (
      typeof nome !== 'string' ||
      nomes.length !== 1 ||
      nomes[0] !== nome ||
      opostos.length !== 0
    ) {
      return undefined;
    }
    return definicao.variaveis.find((variavel) => variavel.nome === nome);
  }

  private executarMensagem(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ) {
    const texto = Reflect.get(no.parametros, 'texto');
    if (no.tipo === 'ENVIAR_MENSAGEM') {
      return this.mensagens.criarAutomatica(
        {
          atendimentoId: execucao.atendimentoId,
          execucaoFluxoId: execucao.id,
          revisaoExecucao: execucao.revisao,
          texto,
          tipo: 'TEXTO',
        },
        transacao,
        relogio,
      );
    }
    return this.mensagens.criarAutomatica(
      {
        atendimentoId: execucao.atendimentoId,
        execucaoFluxoId: execucao.id,
        opcoes: Reflect.get(no.parametros, 'opcoes'),
        revisaoExecucao: execucao.revisao,
        texto,
        tipo: 'LISTA',
      },
      transacao,
      relogio,
    );
  }

  private async finalizarPasso(
    iniciado: PassoExecucaoFluxoPersistido,
    saidaSanitizada: PassoExecucaoFluxoPersistido['entradaSanitizada'],
    codigoErro: string | undefined,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const finalizado: PassoExecucaoFluxoPersistido = {
      ...iniciado,
      ...(codigoErro === undefined ? {} : { codigoErro }),
      estado: codigoErro === undefined ? 'CONCLUIDO' : 'FALHOU',
      finalizadoEm: agora,
      saidaSanitizada,
    };
    if (!(await this.repositorioPassos.finalizar(finalizado, transacao))) {
      throw new ErroConflitoExecucaoFluxo();
    }
  }

  private validarSaida(
    no: NoDefinicaoFluxo,
    resultado: string,
  ):
    | ResultadoNoMensagemFluxo
    | 'SUCESSO'
    | 'VERDADEIRO'
    | 'FALSO'
    | 'FALHA'
    | 'CONCLUIDO'
    | 'TIMEOUT'
    | 'DENTRO_HORARIO'
    | 'FORA_HORARIO'
    | 'IDENTIFICADO'
    | 'NAO_IDENTIFICADO'
    | 'ENVIADO'
    | 'SELECIONADO'
    | 'NAO_SELECIONADO' {
    const permitidas = (() => {
      if (no.tipo === 'ENVIAR_BOTOES_OU_LISTA') {
        return new Set([
          'SUCESSO',
          'FALLBACK',
          'FALHA_TEMPORARIA',
          'FALHA_DEFINITIVA',
        ]);
      }
      if (no.tipo === 'ENVIAR_MENSAGEM') {
        return new Set(['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA']);
      }
      if (no.tipo === 'CONDICAO') {
        return new Set(['VERDADEIRO', 'FALSO', 'FALHA']);
      }
      if (no.tipo === 'DEFINIR_VARIAVEL') {
        return new Set(['SUCESSO', 'FALHA']);
      }
      if (no.tipo === 'AGUARDAR') {
        return new Set(['CONCLUIDO', 'TIMEOUT', 'FALHA']);
      }
      if (no.tipo === 'HORARIO_ATENDIMENTO') {
        return new Set(['DENTRO_HORARIO', 'FORA_HORARIO', 'FALHA']);
      }
      if (no.tipo === 'IDENTIFICAR_CONTATO') {
        return new Set(['IDENTIFICADO', 'NAO_IDENTIFICADO', 'FALHA']);
      }
      if (no.tipo === 'SOLICITAR_DADOS_CONTATO') {
        return new Set(['ENVIADO', 'FALLBACK', 'FALHA']);
      }
      if (
        no.tipo === 'SELECIONAR_CLIENTE' ||
        no.tipo === 'SELECIONAR_CONTRATO'
      ) {
        return new Set(['SELECIONADO', 'NAO_SELECIONADO', 'FALHA']);
      }
      return new Set(['SUCESSO']);
    })();
    if (!permitidas.has(resultado)) throw new ErroExecucaoFluxoInvalida();
    return resultado as
      | ResultadoNoMensagemFluxo
      | 'SUCESSO'
      | 'VERDADEIRO'
      | 'FALSO'
      | 'FALHA'
      | 'CONCLUIDO'
      | 'TIMEOUT'
      | 'DENTRO_HORARIO'
      | 'FORA_HORARIO'
      | 'IDENTIFICADO'
      | 'NAO_IDENTIFICADO'
      | 'ENVIADO'
      | 'SELECIONADO'
      | 'NAO_SELECIONADO';
  }

  private obterDestino(
    conexoes: readonly ConexaoDefinicaoFluxo[],
    noId: string,
    saida: string,
  ): string {
    const correspondentes = conexoes.filter(
      (conexao) => conexao.origemNoId === noId && conexao.saida === saida,
    );
    if (correspondentes.length !== 1) throw new ErroExecucaoFluxoInvalida();
    return correspondentes[0]!.destinoNoId;
  }

  private lerDefinicao(valor: unknown): DefinicaoFluxoV1 {
    if (
      valor === null ||
      typeof valor !== 'object' ||
      Array.isArray(valor) ||
      Reflect.get(valor, 'versaoSchema') !== 1 ||
      !Array.isArray(Reflect.get(valor, 'nos')) ||
      !Array.isArray(Reflect.get(valor, 'conexoes'))
    ) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor as unknown as DefinicaoFluxoV1;
  }
}
