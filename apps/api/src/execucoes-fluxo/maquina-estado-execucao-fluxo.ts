import {
  ErroExecucaoFluxoInvalida,
  ErroExecucaoFluxoTerminal,
  ErroTransicaoExecucaoFluxoInvalida,
} from './erros-execucao-fluxo.js';
import {
  ESTADOS_EXECUCAO_FLUXO,
  ESTADOS_TERMINAIS_EXECUCAO_FLUXO,
  type ComandoTransicaoExecucaoFluxo,
  type EstadoExecucaoFluxo,
  type ExecucaoFluxoPersistida,
} from './modelo-execucao-fluxo.js';
import type { ValorJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFICADOR_NO = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const CODIGO = /^[A-Z][A-Z0-9_]{2,99}$/u;
const COMANDOS_SEM_CODIGO = [
  'AGUARDAR_RESPOSTA',
  'AGUARDAR_SISTEMA',
  'AGUARDAR_ATENDENTE',
  'RETOMAR',
  'CONCLUIR',
  'SUSPENDER_POR_ATENDIMENTO_HUMANO',
] as const;
const COMANDOS_COM_CODIGO = ['FALHAR', 'CANCELAR'] as const;
const ESTADOS_TERMINAIS = new Set<EstadoExecucaoFluxo>(
  ESTADOS_TERMINAIS_EXECUCAO_FLUXO,
);

export class MaquinaEstadoExecucaoFluxo {
  public avancarNo(
    atual: ExecucaoFluxoPersistida,
    proximoNoId: string,
    agora: Date,
  ): ExecucaoFluxoPersistida {
    this.validar(atual);
    if (
      atual.estado !== 'EXECUTANDO' ||
      !IDENTIFICADOR_NO.test(proximoNoId) ||
      proximoNoId === atual.noAtualId ||
      !Number.isFinite(agora.getTime()) ||
      agora < atual.atualizadaEm
    ) {
      throw new ErroTransicaoExecucaoFluxoInvalida();
    }
    const proxima = {
      ...atual,
      atualizadaEm: agora,
      noAtualId: proximoNoId,
      revisao: atual.revisao + 1,
    };
    this.validar(proxima);
    return proxima;
  }

  public agendarRetomada(
    atual: ExecucaoFluxoPersistida,
    retomarEm: Date,
    agora: Date,
  ): ExecucaoFluxoPersistida {
    this.validar(atual);
    if (
      atual.estado !== 'EXECUTANDO' ||
      !Number.isFinite(retomarEm.getTime()) ||
      retomarEm <= agora
    ) {
      throw new ErroTransicaoExecucaoFluxoInvalida();
    }
    const aguardando = this.transitar(
      atual,
      { tipo: 'AGUARDAR_SISTEMA' },
      agora,
    );
    const agendada = { ...aguardando, retomarEm };
    this.validar(agendada);
    return agendada;
  }

  public transitar(
    atual: ExecucaoFluxoPersistida,
    comandoRecebido: unknown,
    agora: Date,
  ): ExecucaoFluxoPersistida {
    this.validar(atual);
    if (ESTADOS_TERMINAIS.has(atual.estado)) {
      throw new ErroExecucaoFluxoTerminal();
    }
    if (!Number.isFinite(agora.getTime()) || agora < atual.atualizadaEm) {
      throw new ErroTransicaoExecucaoFluxoInvalida();
    }
    const comando = this.lerComando(comandoRecebido);
    const proximoEstado = this.obterProximoEstado(atual.estado, comando);
    const codigoFinalizacao = this.obterCodigoFinalizacao(comando);
    const terminal = ESTADOS_TERMINAIS.has(proximoEstado);
    const proxima: ExecucaoFluxoPersistida = {
      atendimentoId: atual.atendimentoId,
      atualizadaEm: agora,
      contextoProtegido: atual.contextoProtegido,
      estado: proximoEstado,
      fluxoId: atual.fluxoId,
      id: atual.id,
      iniciadaEm: atual.iniciadaEm,
      noAtualId: atual.noAtualId,
      revisao: atual.revisao + 1,
      versaoFluxoId: atual.versaoFluxoId,
      ...(terminal ? { codigoFinalizacao, finalizadaEm: agora } : {}),
    };
    this.validar(proxima);
    return proxima;
  }

  public validar(execucao: ExecucaoFluxoPersistida): void {
    const terminal = ESTADOS_TERMINAIS.has(execucao.estado);
    if (
      ![execucao.id, execucao.atendimentoId, execucao.fluxoId, execucao.versaoFluxoId].every(
        (id) => UUID.test(id),
      ) ||
      !ESTADOS_EXECUCAO_FLUXO.some((estado) => estado === execucao.estado) ||
      !IDENTIFICADOR_NO.test(execucao.noAtualId) ||
      !Number.isInteger(execucao.revisao) ||
      execucao.revisao < 1 ||
      !Number.isFinite(execucao.iniciadaEm.getTime()) ||
      !Number.isFinite(execucao.atualizadaEm.getTime()) ||
      execucao.atualizadaEm < execucao.iniciadaEm ||
      !this.ehObjetoJsonProtegido(execucao.contextoProtegido) ||
      (execucao.retomarEm !== undefined &&
        (!Number.isFinite(execucao.retomarEm.getTime()) ||
          execucao.estado !== 'AGUARDANDO_SISTEMA' ||
          execucao.retomarEm <= execucao.atualizadaEm)) ||
      terminal !== (execucao.finalizadaEm !== undefined) ||
      terminal !== (execucao.codigoFinalizacao !== undefined) ||
      (execucao.finalizadaEm !== undefined &&
        (!Number.isFinite(execucao.finalizadaEm.getTime()) ||
          execucao.finalizadaEm < execucao.atualizadaEm)) ||
      (execucao.codigoFinalizacao !== undefined &&
        !CODIGO.test(execucao.codigoFinalizacao)) ||
      (terminal && execucao.retomarEm !== undefined)
    ) {
      throw new ErroExecucaoFluxoInvalida();
    }
  }

  private lerComando(valor: unknown): ComandoTransicaoExecucaoFluxo {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      throw new ErroTransicaoExecucaoFluxoInvalida();
    }
    const tipo = Reflect.get(valor, 'tipo');
    const chaves = Object.keys(valor);
    if (
      typeof tipo === 'string' &&
      this.ehComandoSemCodigo(tipo) &&
      chaves.length === 1
    ) {
      return { tipo } satisfies ComandoTransicaoExecucaoFluxo;
    }
    const codigo = Reflect.get(valor, 'codigo');
    if (
      typeof tipo === 'string' &&
      this.ehComandoComCodigo(tipo) &&
      typeof codigo === 'string' &&
      CODIGO.test(codigo) &&
      chaves.length === 2 &&
      chaves.every((chave) => ['codigo', 'tipo'].includes(chave))
    ) {
      return { codigo, tipo } satisfies ComandoTransicaoExecucaoFluxo;
    }
    throw new ErroTransicaoExecucaoFluxoInvalida();
  }

  private ehComandoSemCodigo(
    valor: string,
  ): valor is (typeof COMANDOS_SEM_CODIGO)[number] {
    return COMANDOS_SEM_CODIGO.some((tipo) => tipo === valor);
  }

  private ehComandoComCodigo(
    valor: string,
  ): valor is (typeof COMANDOS_COM_CODIGO)[number] {
    return COMANDOS_COM_CODIGO.some((tipo) => tipo === valor);
  }

  private obterProximoEstado(
    atual: EstadoExecucaoFluxo,
    comando: ComandoTransicaoExecucaoFluxo,
  ): EstadoExecucaoFluxo {
    const destino: EstadoExecucaoFluxo = (() => {
      switch (comando.tipo) {
        case 'AGUARDAR_RESPOSTA':
          return 'AGUARDANDO_RESPOSTA';
        case 'AGUARDAR_SISTEMA':
          return 'AGUARDANDO_SISTEMA';
        case 'AGUARDAR_ATENDENTE':
          return 'AGUARDANDO_ATENDENTE';
        case 'RETOMAR':
          return 'EXECUTANDO';
        case 'CONCLUIR':
          return 'CONCLUIDA';
        case 'FALHAR':
          return 'FALHOU';
        case 'CANCELAR':
          return 'CANCELADA';
        case 'SUSPENDER_POR_ATENDIMENTO_HUMANO':
          return 'SUSPENSA_POR_ATENDIMENTO_HUMANO';
      }
    })();
    const permitidas = this.transicoesPermitidas(atual);
    if (!permitidas.has(destino)) {
      throw new ErroTransicaoExecucaoFluxoInvalida();
    }
    return destino;
  }

  private transicoesPermitidas(
    estado: EstadoExecucaoFluxo,
  ): ReadonlySet<EstadoExecucaoFluxo> {
    switch (estado) {
      case 'EXECUTANDO':
        return new Set([
          'AGUARDANDO_RESPOSTA',
          'AGUARDANDO_SISTEMA',
          'AGUARDANDO_ATENDENTE',
          'SUSPENSA_POR_ATENDIMENTO_HUMANO',
          'CONCLUIDA',
          'FALHOU',
          'CANCELADA',
        ]);
      case 'AGUARDANDO_RESPOSTA':
        return new Set([
          'EXECUTANDO',
          'SUSPENSA_POR_ATENDIMENTO_HUMANO',
          'CANCELADA',
        ]);
      case 'AGUARDANDO_SISTEMA':
        return new Set([
          'EXECUTANDO',
          'SUSPENSA_POR_ATENDIMENTO_HUMANO',
          'FALHOU',
          'CANCELADA',
        ]);
      case 'AGUARDANDO_ATENDENTE':
        return new Set([
          'SUSPENSA_POR_ATENDIMENTO_HUMANO',
          'CANCELADA',
        ]);
      default:
        return new Set();
    }
  }

  private obterCodigoFinalizacao(
    comando: ComandoTransicaoExecucaoFluxo,
  ): string | undefined {
    switch (comando.tipo) {
      case 'CONCLUIR':
        return 'FIM_ALCANCADO';
      case 'FALHAR':
      case 'CANCELAR':
        return comando.codigo;
      case 'SUSPENDER_POR_ATENDIMENTO_HUMANO':
        return 'ATENDIMENTO_HUMANO_ASSUMIU';
      default:
        return undefined;
    }
  }

  private ehObjetoJsonProtegido(
    valor: unknown,
  ): valor is ExecucaoFluxoPersistida['contextoProtegido'] {
    return (
      valor !== null &&
      typeof valor === 'object' &&
      !Array.isArray(valor) &&
      Object.values(valor).every((item) => this.ehValorJson(item, 1))
    );
  }

  private ehValorJson(
    valor: unknown,
    profundidade: number,
  ): valor is ValorJsonProtegido {
    if (profundidade > 20) return false;
    if (
      valor === null ||
      typeof valor === 'boolean' ||
      typeof valor === 'string'
    ) {
      return true;
    }
    if (typeof valor === 'number') return Number.isFinite(valor);
    if (Array.isArray(valor)) {
      return valor.every((item) => this.ehValorJson(item, profundidade + 1));
    }
    return (
      typeof valor === 'object' &&
      Object.values(valor).every((item) =>
        this.ehValorJson(item, profundidade + 1),
      )
    );
  }
}
