import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import { ServicoCatalogoFluxos } from '../fluxos/servico-catalogo-fluxos.js';
import type { DefinicaoFluxo } from '../fluxos/modelo-fluxo.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroConflitoExecucaoFluxo,
  ErroExecucaoFluxoInvalida,
  ErroInicioExecucaoFluxoNegado,
} from './erros-execucao-fluxo.js';
import { MaquinaEstadoExecucaoFluxo } from './maquina-estado-execucao-fluxo.js';
import type {
  EntradaAgendamentoExecucaoFluxo,
  EntradaAvancoNoExecucaoFluxo,
  EntradaInicioExecucaoFluxo,
  EntradaTransicaoExecucaoFluxo,
  ExecucaoFluxoPersistida,
} from './modelo-execucao-fluxo.js';
import {
  REPOSITORIO_EXECUCOES_FLUXO,
  type RepositorioExecucoesFluxo,
} from './repositorio-execucoes-fluxo.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFICADOR_NO = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;

@Injectable()
export class ServicoExecucoesFluxo {
  private readonly maquina = new MaquinaEstadoExecucaoFluxo();

  public constructor(
    @Inject(REPOSITORIO_EXECUCOES_FLUXO)
    private readonly repositorio: RepositorioExecucoesFluxo,
    @Inject(ServicoCatalogoFluxos)
    private readonly catalogo: ServicoCatalogoFluxos,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async iniciar(
    entrada: EntradaInicioExecucaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ExecucaoFluxoPersistida> {
    const atendimentoId = this.validarId(entrada.atendimentoId);
    const fluxoId = this.validarId(entrada.fluxoId);
    const existente = await this.repositorio.obterAtivaPorAtendimento(
      atendimentoId,
      transacao,
    );
    if (existente !== undefined) {
      if (existente.fluxoId === fluxoId) return existente;
      throw new ErroInicioExecucaoFluxoNegado();
    }
    const versao = await this.catalogo.obterVersaoPublicadaParaNovaExecucao(
      fluxoId,
      transacao,
    );
    const agora = this.obterAgora(relogio);
    const execucao: ExecucaoFluxoPersistida = {
      atendimentoId,
      atualizadaEm: agora,
      contextoProtegido: {},
      estado: 'EXECUTANDO',
      fluxoId,
      id: randomUUID(),
      iniciadaEm: agora,
      noAtualId: this.obterNoInicial(versao.definicao),
      revisao: 1,
      versaoFluxoId: versao.id,
    };
    this.maquina.validar(execucao);
    if (
      !(await this.repositorio.criarSeAtendimentoAutomatizavel(
        execucao,
        transacao,
      ))
    ) {
      const ativa = await this.repositorio.obterAtivaPorAtendimento(
        atendimentoId,
        transacao,
      );
      if (
        ativa !== undefined &&
        ativa.fluxoId === fluxoId
      ) {
        return ativa;
      }
      throw new ErroInicioExecucaoFluxoNegado();
    }
    await this.auditar(
      'EXECUCAO_FLUXO_INICIADA',
      'INICIAR_EXECUCAO_FLUXO',
      execucao,
      transacao,
    );
    return execucao;
  }

  public async transitar(
    entrada: EntradaTransicaoExecucaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ExecucaoFluxoPersistida> {
    const execucaoFluxoId = this.validarId(entrada.execucaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoEsperada);
    const atual = await this.repositorio.obterPorId(execucaoFluxoId, transacao);
    if (atual === undefined) throw new ErroExecucaoFluxoInvalida();
    if (atual.revisao !== revisaoEsperada) {
      throw new ErroConflitoExecucaoFluxo();
    }
    const proxima = this.maquina.transitar(
      atual,
      entrada.comando,
      this.obterAgora(relogio),
    );
    if (
      !(await this.repositorio.alterarCondicional(
        proxima,
        atual.estado,
        revisaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoExecucaoFluxo();
    }
    await this.auditar(
      'EXECUCAO_FLUXO_TRANSITADA',
      'TRANSITAR_EXECUCAO_FLUXO',
      proxima,
      transacao,
    );
    return proxima;
  }

  public async agendarRetomada(
    entrada: EntradaAgendamentoExecucaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ExecucaoFluxoPersistida> {
    const execucaoFluxoId = this.validarId(entrada.execucaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoEsperada);
    const retomarEm = this.validarInstante(entrada.retomarEm);
    const atual = await this.repositorio.obterPorId(execucaoFluxoId, transacao);
    if (atual === undefined) throw new ErroExecucaoFluxoInvalida();
    if (atual.revisao !== revisaoEsperada) {
      throw new ErroConflitoExecucaoFluxo();
    }
    const proxima = this.maquina.agendarRetomada(
      atual,
      retomarEm,
      this.obterAgora(relogio),
    );
    if (
      !(await this.repositorio.alterarCondicional(
        proxima,
        atual.estado,
        revisaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoExecucaoFluxo();
    }
    await this.auditar(
      'EXECUCAO_FLUXO_AGENDADA',
      'AGENDAR_RETOMADA_EXECUCAO_FLUXO',
      proxima,
      transacao,
    );
    return proxima;
  }

  public async avancarNo(
    entrada: EntradaAvancoNoExecucaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ExecucaoFluxoPersistida> {
    const execucaoFluxoId = this.validarId(entrada.execucaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoEsperada);
    const proximoNoId = this.validarNoId(entrada.proximoNoId);
    const atual = await this.repositorio.obterPorId(execucaoFluxoId, transacao);
    if (atual === undefined) throw new ErroExecucaoFluxoInvalida();
    if (atual.revisao !== revisaoEsperada) {
      throw new ErroConflitoExecucaoFluxo();
    }
    const proxima = this.maquina.avancarNo(
      atual,
      proximoNoId,
      this.obterAgora(relogio),
      entrada.contextoProtegido ?? atual.contextoProtegido,
    );
    if (
      !(await this.repositorio.alterarCondicional(
        proxima,
        atual.estado,
        revisaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoExecucaoFluxo();
    }
    await this.auditar(
      'EXECUCAO_FLUXO_AVANCOU_NO',
      'AVANCAR_NO_EXECUCAO_FLUXO',
      proxima,
      transacao,
    );
    return proxima;
  }

  private async auditar(
    tipoEvento: string,
    acao: string,
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao,
        dadosNovos: {
          atendimentoId: execucao.atendimentoId,
          estado: execucao.estado,
          fluxoId: execucao.fluxoId,
          noAtualId: execucao.noAtualId,
          revisao: execucao.revisao,
          ...(execucao.retomarEm === undefined
            ? {}
            : { retomarEm: execucao.retomarEm.toISOString() }),
          versaoFluxoId: execucao.versaoFluxoId,
          ...(execucao.codigoFinalizacao === undefined
            ? {}
            : { codigoFinalizacao: execucao.codigoFinalizacao }),
        },
        entidadeId: execucao.id,
        entidadeTipo: 'EXECUCAO_FLUXO',
        origem: 'SISTEMA',
        tipoEvento,
      },
      transacao,
    );
  }

  private obterNoInicial(definicao: DefinicaoFluxo): string {
    const inicio = Reflect.get(definicao, 'inicioNoId');
    if (typeof inicio !== 'string' || !IDENTIFICADOR_NO.test(inicio)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return inicio;
  }

  private validarId(valor: unknown): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor;
  }

  private validarRevisao(valor: unknown): number {
    if (!Number.isInteger(valor) || typeof valor !== 'number' || valor < 1) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor;
  }

  private validarNoId(valor: unknown): string {
    if (typeof valor !== 'string' || !IDENTIFICADOR_NO.test(valor)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor;
  }

  private validarInstante(valor: unknown): Date {
    if (!(valor instanceof Date) || !Number.isFinite(valor.getTime())) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor;
  }

  private obterAgora(relogio: () => Date): Date {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return agora;
  }
}
