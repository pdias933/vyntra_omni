import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { SanitizadorDadosProtegidos } from '../seguranca/sanitizador-dados-protegidos.js';
import type {
  ConcessaoOperacao,
  EntradaEncerramentoOperacao,
  EntradaIdempotencia,
  EstadoOperacaoRecuperavel,
  OperacaoRecuperavel,
  ResultadoIdempotencia,
} from './modelo-idempotencia.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_HEXADECIMAL = /^[a-f0-9]{64}$/u;
const NOME_CANONICO = /^[A-Z][A-Z0-9_]{2,99}$/u;
const DURACAO_CONCESSAO_MINIMA_MS = 5_000;
const DURACAO_CONCESSAO_MAXIMA_MS = 300_000;

type TipoConcessao = 'EXECUCAO' | 'RECONCILIACAO';
type ResultadoTentativa =
  | 'EFEITO_AUSENTE'
  | 'FALHA_DEFINITIVA'
  | 'FALHA_TEMPORARIA'
  | 'RESULTADO_INCERTO'
  | 'SUCESSO';

interface EncerramentoInterno {
  readonly entrada: EntradaEncerramentoOperacao;
  readonly estadosPermitidos: readonly EstadoOperacaoRecuperavel[];
  readonly estadoFinal: EstadoOperacaoRecuperavel;
  readonly resultadoTentativa: ResultadoTentativa;
  readonly terminal: boolean;
}

@Injectable()
export class ServicoIdempotencia {
  private readonly sanitizador = new SanitizadorDadosProtegidos();

  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async iniciarOuObter(
    entrada: EntradaIdempotencia,
    transacao?: TransacaoPrisma,
  ): Promise<ResultadoIdempotencia> {
    this.validarEntrada(entrada);
    const executar = async (contexto: TransacaoPrisma): Promise<ResultadoIdempotencia> => {
      const registroId = randomUUID();
      const operacaoId = randomUUID();
      const agora = new Date();
      const chaveHash = this.hash(entrada.chaveIdempotencia.toLowerCase());
      const insercao = await contexto.registroIdempotencia.createMany({
        data: {
          assinaturaRequisicaoHash: entrada.assinaturaRequisicaoHash,
          chaveHash,
          criadoEm: agora,
          escopoId: entrada.escopoId,
          escopoTipo: entrada.escopoTipo,
          id: registroId,
        },
        skipDuplicates: true,
      });

      if (insercao.count === 1) {
        await contexto.operacaoRecuperavel.create({
          data: {
            atualizadoEm: agora,
            criadoEm: agora,
            entidadeId: entrada.entidadeId ?? null,
            entidadeTipo: entrada.entidadeTipo ?? null,
            id: operacaoId,
            registroIdempotenciaId: registroId,
            tipo: entrada.tipoOperacao,
          },
        });
      }

      const registro = await contexto.registroIdempotencia.findUnique({
        include: { operacao: true },
        where: {
          escopoTipo_escopoId_chaveHash: {
            chaveHash,
            escopoId: entrada.escopoId,
            escopoTipo: entrada.escopoTipo,
          },
        },
      });

      if (registro === null) {
        throw new Error('REGISTRO_IDEMPOTENCIA_INCONSISTENTE');
      }
      if (registro.assinaturaRequisicaoHash !== entrada.assinaturaRequisicaoHash) {
        throw new Error('CHAVE_IDEMPOTENCIA_REUTILIZADA');
      }
      if (registro.operacao === null) {
        throw new Error('OPERACAO_IDEMPOTENTE_INCONSISTENTE');
      }

      return {
        operacao: this.mapearOperacao(registro.operacao),
        situacao: registro.id === registroId ? 'NOVA' : 'EXISTENTE',
      };
    };

    return transacao === undefined
      ? this.prisma.executarTransacao(executar)
      : executar(transacao);
  }

  public concederExecucao(
    operacaoId: string,
    duracaoMs: number,
  ): Promise<ConcessaoOperacao> {
    return this.conceder(operacaoId, duracaoMs, 'EXECUCAO');
  }

  public concederReconciliacao(
    operacaoId: string,
    duracaoMs: number,
  ): Promise<ConcessaoOperacao> {
    return this.conceder(operacaoId, duracaoMs, 'RECONCILIACAO');
  }

  public concluir(
    entrada: EntradaEncerramentoOperacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    return this.encerrar(
      {
        entrada,
        estadoFinal: 'CONCLUIDA',
        estadosPermitidos: ['EM_EXECUCAO', 'EM_RECONCILIACAO'],
        resultadoTentativa: 'SUCESSO',
        terminal: true,
      },
      transacao,
    );
  }

  public registrarFalhaTemporaria(
    entrada: EntradaEncerramentoOperacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    this.validarProximaAcao(entrada.proximaAcaoEm);
    this.validarCodigoObrigatorio(entrada.codigo);
    return this.encerrar(
      {
        entrada,
        estadoFinal: 'AGUARDANDO_NOVA_TENTATIVA',
        estadosPermitidos: ['EM_EXECUCAO'],
        resultadoTentativa: 'FALHA_TEMPORARIA',
        terminal: false,
      },
      transacao,
    );
  }

  public registrarResultadoIncerto(
    entrada: EntradaEncerramentoOperacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    this.validarProximaAcao(entrada.proximaAcaoEm);
    this.validarCodigoObrigatorio(entrada.codigo);
    return this.encerrar(
      {
        entrada,
        estadoFinal: 'RESULTADO_INCERTO',
        estadosPermitidos: ['EM_EXECUCAO', 'EM_RECONCILIACAO'],
        resultadoTentativa: 'RESULTADO_INCERTO',
        terminal: false,
      },
      transacao,
    );
  }

  public registrarEfeitoAusente(
    entrada: EntradaEncerramentoOperacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    this.validarProximaAcao(entrada.proximaAcaoEm);
    return this.encerrar(
      {
        entrada,
        estadoFinal: 'AGUARDANDO_NOVA_TENTATIVA',
        estadosPermitidos: ['EM_RECONCILIACAO'],
        resultadoTentativa: 'EFEITO_AUSENTE',
        terminal: false,
      },
      transacao,
    );
  }

  public registrarFalhaDefinitiva(
    entrada: EntradaEncerramentoOperacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    this.validarCodigoObrigatorio(entrada.codigo);
    return this.encerrar(
      {
        entrada,
        estadoFinal: 'FALHA_DEFINITIVA',
        estadosPermitidos: ['EM_EXECUCAO', 'EM_RECONCILIACAO'],
        resultadoTentativa: 'FALHA_DEFINITIVA',
        terminal: true,
      },
      transacao,
    );
  }

  public async recuperarConcessoesExpiradas(limite = 100): Promise<number> {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new Error('LIMITE_RECUPERACAO_INVALIDO');
    }

    return this.prisma.executarTransacao(async (transacao) => {
      const agora = new Date();
      const expiradas = await transacao.operacaoRecuperavel.findMany({
        orderBy: { concessaoAte: 'asc' },
        take: limite,
        where: {
          concessaoAte: { lte: agora },
          estado: { in: ['EM_EXECUCAO', 'EM_RECONCILIACAO'] },
        },
      });
      let recuperadas = 0;

      for (const operacao of expiradas) {
        if (operacao.concessaoTokenHash === null) {
          throw new Error('CONCESSAO_OPERACAO_INCONSISTENTE');
        }
        const alteracao = await transacao.operacaoRecuperavel.updateMany({
          data: {
            codigoUltimoErro: 'CONCESSAO_EXPIRADA',
            concessaoAte: null,
            concessaoTokenHash: null,
            estado: 'RESULTADO_INCERTO',
            proximaAcaoEm: agora,
            versao: { increment: 1 },
          },
          where: {
            concessaoAte: { lte: agora },
            concessaoTokenHash: operacao.concessaoTokenHash,
            estado: operacao.estado,
            id: operacao.id,
            versao: operacao.versao,
          },
        });

        if (alteracao.count === 0) {
          continue;
        }

        const tentativa = await transacao.tentativaOperacao.updateMany({
          data: {
            codigoResultado: 'CONCESSAO_EXPIRADA',
            encerradaEm: agora,
            resultado: 'RESULTADO_INCERTO',
          },
          where: {
            concessaoTokenHash: operacao.concessaoTokenHash,
            numero: operacao.tentativas,
            operacaoId: operacao.id,
            resultado: 'EM_ANDAMENTO',
          },
        });
        if (tentativa.count !== 1) {
          throw new Error('TENTATIVA_OPERACAO_INCONSISTENTE');
        }
        recuperadas += 1;
      }

      return recuperadas;
    });
  }

  private async conceder(
    operacaoId: string,
    duracaoMs: number,
    tipo: TipoConcessao,
  ): Promise<ConcessaoOperacao> {
    this.validarUuid(operacaoId);
    if (
      !Number.isInteger(duracaoMs) ||
      duracaoMs < DURACAO_CONCESSAO_MINIMA_MS ||
      duracaoMs > DURACAO_CONCESSAO_MAXIMA_MS
    ) {
      throw new Error('DURACAO_CONCESSAO_INVALIDA');
    }

    return this.prisma.executarTransacao(async (transacao) => {
      const agora = new Date();
      const operacao = await transacao.operacaoRecuperavel.findUnique({
        where: { id: operacaoId },
      });
      const estadosPermitidos: readonly EstadoOperacaoRecuperavel[] =
        tipo === 'EXECUCAO'
          ? ['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA']
          : ['RESULTADO_INCERTO'];

      if (
        operacao === null ||
        !estadosPermitidos.includes(operacao.estado) ||
        operacao.proximaAcaoEm === null ||
        operacao.proximaAcaoEm > agora
      ) {
        throw new Error('OPERACAO_NAO_DISPONIVEL');
      }

      const tokenConcessao = randomUUID();
      const tokenHash = this.hash(tokenConcessao);
      const concedidaAte = new Date(agora.getTime() + duracaoMs);
      const numeroTentativa = operacao.tentativas + 1;
      const alteracao = await transacao.operacaoRecuperavel.updateMany({
        data: {
          concessaoAte: concedidaAte,
          concessaoTokenHash: tokenHash,
          estado: tipo === 'EXECUCAO' ? 'EM_EXECUCAO' : 'EM_RECONCILIACAO',
          proximaAcaoEm: null,
          tentativas: { increment: 1 },
          versao: { increment: 1 },
        },
        where: {
          estado: operacao.estado,
          id: operacao.id,
          proximaAcaoEm: { lte: agora },
          versao: operacao.versao,
        },
      });
      if (alteracao.count !== 1) {
        throw new Error('OPERACAO_NAO_DISPONIVEL');
      }

      await transacao.tentativaOperacao.create({
        data: {
          concessaoTokenHash: tokenHash,
          id: randomUUID(),
          iniciadaEm: agora,
          numero: numeroTentativa,
          operacaoId,
          tipo,
        },
      });

      return {
        concedidaAte,
        numeroTentativa,
        operacaoId,
        tipo,
        tokenConcessao,
      };
    });
  }

  private async encerrar(
    configuracao: EncerramentoInterno,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    const { entrada } = configuracao;
    this.validarUuid(entrada.operacaoId);
    this.validarUuid(entrada.tokenConcessao);
    if (entrada.codigo !== undefined && !NOME_CANONICO.test(entrada.codigo)) {
      throw new Error('CODIGO_RESULTADO_OPERACAO_INVALIDO');
    }

    const executar = async (contexto: TransacaoPrisma): Promise<void> => {
      const agora = new Date();
      const tokenHash = this.hash(entrada.tokenConcessao);
      const operacao = await contexto.operacaoRecuperavel.findUnique({
        where: { id: entrada.operacaoId },
      });
      if (
        operacao === null ||
        operacao.concessaoTokenHash === null ||
        !this.hashIgual(operacao.concessaoTokenHash, tokenHash) ||
        !configuracao.estadosPermitidos.includes(operacao.estado)
      ) {
        throw new Error('CONCESSAO_OPERACAO_INVALIDA');
      }

      const dadosProtegidos = this.sanitizador.sanitizar(entrada.dados);
      const proximaAcaoEm = configuracao.terminal
        ? null
        : (entrada.proximaAcaoEm ?? null);
      const alteracao = await contexto.operacaoRecuperavel.updateMany({
        data: {
          codigoUltimoErro: entrada.codigo ?? null,
          concessaoAte: null,
          concessaoTokenHash: null,
          concluidoEm: configuracao.terminal ? agora : null,
          estado: configuracao.estadoFinal,
          proximaAcaoEm,
          ...(configuracao.estadoFinal === 'CONCLUIDA'
            ? { resultadoProtegido: dadosProtegidos ?? Prisma.DbNull }
            : {}),
          versao: { increment: 1 },
        },
        where: {
          concessaoAte: { gt: agora },
          concessaoTokenHash: tokenHash,
          estado: { in: [...configuracao.estadosPermitidos] },
          id: entrada.operacaoId,
          versao: operacao.versao,
        },
      });
      if (alteracao.count !== 1) {
        throw new Error('CONCESSAO_OPERACAO_EXPIRADA');
      }

      const tentativa = await contexto.tentativaOperacao.updateMany({
        data: {
          codigoResultado: entrada.codigo ?? null,
          dadosProtegidos: dadosProtegidos ?? Prisma.DbNull,
          encerradaEm: agora,
          resultado: configuracao.resultadoTentativa,
        },
        where: {
          concessaoTokenHash: tokenHash,
          numero: operacao.tentativas,
          operacaoId: operacao.id,
          resultado: 'EM_ANDAMENTO',
        },
      });
      if (tentativa.count !== 1) {
        throw new Error('TENTATIVA_OPERACAO_INCONSISTENTE');
      }
    };

    await (transacao === undefined
      ? this.prisma.executarTransacao(executar)
      : executar(transacao));
  }

  private validarEntrada(entrada: EntradaIdempotencia): void {
    if (
      !NOME_CANONICO.test(entrada.escopoTipo) ||
      !NOME_CANONICO.test(entrada.tipoOperacao)
    ) {
      throw new Error('ESCOPO_IDEMPOTENCIA_INVALIDO');
    }
    this.validarUuid(entrada.escopoId);
    this.validarUuid(entrada.chaveIdempotencia);
    if (!HASH_HEXADECIMAL.test(entrada.assinaturaRequisicaoHash)) {
      throw new Error('ASSINATURA_REQUISICAO_INVALIDA');
    }
    if ((entrada.entidadeTipo === undefined) !== (entrada.entidadeId === undefined)) {
      throw new Error('ENTIDADE_OPERACAO_INCOMPLETA');
    }
    if (
      entrada.entidadeTipo !== undefined &&
      !NOME_CANONICO.test(entrada.entidadeTipo)
    ) {
      throw new Error('ENTIDADE_OPERACAO_INVALIDA');
    }
    if (entrada.entidadeId !== undefined) {
      this.validarUuid(entrada.entidadeId);
    }
  }

  private validarUuid(valor: string): void {
    if (!IDENTIFICADOR_UUID.test(valor)) {
      throw new Error('IDENTIFICADOR_OPERACAO_INVALIDO');
    }
  }

  private validarCodigoObrigatorio(codigo: string | undefined): void {
    if (codigo === undefined || !NOME_CANONICO.test(codigo)) {
      throw new Error('CODIGO_RESULTADO_OPERACAO_INVALIDO');
    }
  }

  private validarProximaAcao(valor: Date | undefined): void {
    if (
      valor === undefined ||
      Number.isNaN(valor.getTime()) ||
      valor <= new Date()
    ) {
      throw new Error('PROXIMA_ACAO_OPERACAO_INVALIDA');
    }
  }

  private hash(valor: string): string {
    return createHash('sha256').update(valor, 'utf8').digest('hex');
  }

  private hashIgual(primeiro: string, segundo: string): boolean {
    const a = Buffer.from(primeiro, 'hex');
    const b = Buffer.from(segundo, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private mapearOperacao(operacao: {
    id: string;
    registroIdempotenciaId: string;
    tipo: string;
    entidadeTipo: string | null;
    entidadeId: string | null;
    estado: EstadoOperacaoRecuperavel;
    tentativas: number;
    versao: number;
    proximaAcaoEm: Date | null;
    codigoUltimoErro: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
    concluidoEm: Date | null;
  }): OperacaoRecuperavel {
    return {
      atualizadoEm: operacao.atualizadoEm,
      codigoUltimoErro: operacao.codigoUltimoErro ?? undefined,
      concluidoEm: operacao.concluidoEm ?? undefined,
      criadoEm: operacao.criadoEm,
      entidadeId: operacao.entidadeId ?? undefined,
      entidadeTipo: operacao.entidadeTipo ?? undefined,
      estado: operacao.estado,
      id: operacao.id,
      proximaAcaoEm: operacao.proximaAcaoEm ?? undefined,
      registroIdempotenciaId: operacao.registroIdempotenciaId,
      tentativas: operacao.tentativas,
      tipo: operacao.tipo,
      versao: operacao.versao,
    };
  }
}
