import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { EscritasErp } from '../erp/adaptador-erp.js';
import type {
  ComandoAtualizarOrdemServicoErp,
  ComandoCriarOrdemServicoErp,
  ResultadoAtualizacaoOrdemServicoErp,
  ResultadoCriacaoOrdemServicoErp,
  ResultadoReconciliacaoAtualizacaoOrdemServicoErp,
  ResultadoReconciliacaoCriacaoOrdemServicoErp,
} from '../erp/modelo-erp.js';
import type {
  ConcessaoOperacao,
  ResultadoIdempotencia,
} from '../idempotencia/modelo-idempotencia.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroEntradaOrdemServicoInvalida } from './erros-ordem-servico.js';
import type {
  ContextoOrdemServicoErp,
  AtorFluxoOrdemServicoErp,
  EntradaAtualizacaoOrdemServicoErp,
  EntradaCriacaoOrdemServicoErp,
  OrdemServicoErpPersistida,
  ResultadoOperacaoOrdemServicoErp,
} from './modelo-ordem-servico.js';
import {
  REPOSITORIO_ORDENS_SERVICO,
  type RepositorioOrdensServico,
} from './repositorio-ordens-servico.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFICADOR_EXTERNO_MAXIMO = 256;
const DURACAO_CONCESSAO_PADRAO_MS = 60_000;

type AtorOrdemServicoErp =
  | ContextoSessaoAutorizacao
  | AtorFluxoOrdemServicoErp;

interface ConcessaoAtualizacao extends ConcessaoOperacao {
  readonly ordem: OrdemServicoErpPersistida;
}

@Injectable()
export class ServicoOrdensServicoErp {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoIdempotencia)
    private readonly idempotencia: ServicoIdempotencia,
    @Inject(REPOSITORIO_ORDENS_SERVICO)
    private readonly repositorio: RepositorioOrdensServico,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async criar(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    this.validarAtor(sessao);
    this.validarCriacao(entrada);
    const preparada = await this.prepararCriacao(sessao, entrada);
    const existente = await this.resultadoCriacaoExistente(
      preparada,
      false,
    );
    if (existente !== undefined) return existente;

    const concessao = await this.adquirirCriacao(
      sessao,
      entrada,
      preparada.operacao.id,
      false,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoCriacaoOrdemServicoErp;
    try {
      resultado = await adaptador.criarOrdemServico(
        this.comandoCriacao(entrada),
      );
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        'FALHA_ADAPTADOR_INESPERADA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoCriacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        'RESPOSTA_CRIACAO_ORDEM_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarCriacao(
        sessao,
        entrada,
        concessao,
        resultado.ordemServicoExternaId,
      );
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        resultado.codigo,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    await this.marcarFalhaTemporaria(
      sessao,
      entrada,
      concessao,
      'CRIAR_ORDEM_SERVICO',
      resultado.codigo,
    );
    return this.resultadoAguardando(concessao.operacaoId);
  }

  public async reconciliarCriacao(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    this.validarAtor(sessao);
    this.validarCriacao(entrada);
    const preparada = await this.prepararCriacao(sessao, entrada);
    const existente = await this.resultadoCriacaoExistente(preparada, true);
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirCriacao(
      sessao,
      entrada,
      preparada.operacao.id,
      true,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoReconciliacaoCriacaoOrdemServicoErp;
    try {
      resultado = await adaptador.reconciliarCriacaoOrdemServico({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        clienteExternoId: entrada.clienteExternoId.trim(),
        contratoExternoId: entrada.contratoExternoId.trim(),
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        'FALHA_RECONCILIACAO_INESPERADA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoReconciliacaoCriacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        'RESPOSTA_RECONCILIACAO_ORDEM_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarCriacao(
        sessao,
        entrada,
        concessao,
        resultado.ordemServicoExternaId,
      );
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      await this.registrarEfeitoAusenteCriacao(sessao, entrada, concessao);
      return this.resultadoAguardando(concessao.operacaoId);
    }
    await this.marcarIncerto(
      sessao,
      entrada,
      concessao,
      'CRIAR_ORDEM_SERVICO',
      resultado.codigo,
    );
    return this.resultadoIncerto(concessao.operacaoId);
  }

  public async atualizar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    this.validarAtualizacao(entrada);
    const preparada = await this.prepararAtualizacao(sessao, entrada);
    const existente = await this.resultadoAtualizacaoExistente(
      preparada.idempotencia,
      false,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirAtualizacao(
      sessao,
      entrada,
      preparada.idempotencia.operacao.id,
      false,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoAtualizacaoOrdemServicoErp;
    try {
      resultado = await adaptador.atualizarOrdemServico(
        this.comandoAtualizacao(entrada, concessao.ordem),
      );
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ATUALIZAR_ORDEM_SERVICO',
        'FALHA_ADAPTADOR_INESPERADA',
        entrada.ordemServicoId,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoAtualizacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ATUALIZAR_ORDEM_SERVICO',
        'RESPOSTA_ATUALIZACAO_ORDEM_INVALIDA',
        entrada.ordemServicoId,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarAtualizacao(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ATUALIZAR_ORDEM_SERVICO',
        resultado.codigo,
        entrada.ordemServicoId,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    await this.marcarFalhaTemporaria(
      sessao,
      entrada,
      concessao,
      'ATUALIZAR_ORDEM_SERVICO',
      resultado.codigo,
      entrada.ordemServicoId,
    );
    return this.resultadoAguardando(concessao.operacaoId);
  }

  public async reconciliarAtualizacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    this.validarAtualizacao(entrada);
    const preparada = await this.prepararAtualizacao(sessao, entrada);
    const existente = await this.resultadoAtualizacaoExistente(
      preparada.idempotencia,
      true,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirAtualizacao(
      sessao,
      entrada,
      preparada.idempotencia.operacao.id,
      true,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoReconciliacaoAtualizacaoOrdemServicoErp;
    try {
      resultado = await adaptador.reconciliarAtualizacaoOrdemServico({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        clienteExternoId: entrada.clienteExternoId.trim(),
        contratoExternoId: entrada.contratoExternoId.trim(),
        ordemServicoExternaId: concessao.ordem.ordemServicoExternaId,
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ATUALIZAR_ORDEM_SERVICO',
        'FALHA_RECONCILIACAO_INESPERADA',
        entrada.ordemServicoId,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoReconciliacaoAtualizacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ATUALIZAR_ORDEM_SERVICO',
        'RESPOSTA_RECONCILIACAO_ORDEM_INVALIDA',
        entrada.ordemServicoId,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarAtualizacao(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      await this.registrarEfeitoAusenteAtualizacao(
        sessao,
        entrada,
        concessao,
      );
      return this.resultadoAguardando(concessao.operacaoId);
    }
    await this.marcarIncerto(
      sessao,
      entrada,
      concessao,
      'ATUALIZAR_ORDEM_SERVICO',
      resultado.codigo,
      entrada.ordemServicoId,
    );
    return this.resultadoIncerto(concessao.operacaoId);
  }

  private async prepararCriacao(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
  ): Promise<ResultadoIdempotencia> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.autorizarContexto(sessao, this.contexto(entrada), transacao);
      return this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinarCriacao(entrada),
          chaveIdempotencia: entrada.chaveIdempotencia,
          entidadeId: entrada.atendimentoId,
          entidadeTipo: 'ATENDIMENTO',
          escopoId: entrada.atendimentoId,
          escopoTipo: 'ATENDIMENTO',
          tipoOperacao: 'CRIAR_ORDEM_SERVICO',
        },
        transacao,
      );
    });
  }

  private async prepararAtualizacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
  ): Promise<{
    readonly idempotencia: ResultadoIdempotencia;
    readonly ordem: OrdemServicoErpPersistida;
  }> {
    return this.prisma.executarTransacao(async (transacao) => {
      const ordem = await this.autorizarOrdem(sessao, entrada, transacao);
      const idempotencia = await this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinarAtualizacao(entrada),
          chaveIdempotencia: entrada.chaveIdempotencia,
          entidadeId: entrada.ordemServicoId,
          entidadeTipo: 'ORDEM_SERVICO',
          escopoId: entrada.ordemServicoId,
          escopoTipo: 'ORDEM_SERVICO',
          tipoOperacao: 'ATUALIZAR_ORDEM_SERVICO',
        },
        transacao,
      );
      return { idempotencia, ordem };
    });
  }

  private async adquirirCriacao(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    operacaoId: string,
    reconciliacao: boolean,
  ): Promise<ConcessaoOperacao | ResultadoOperacaoOrdemServicoErp> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.autorizarContexto(sessao, this.contexto(entrada), transacao);
        return reconciliacao
          ? this.idempotencia.concederReconciliacao(
              operacaoId,
              entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
              transacao,
            )
          : this.idempotencia.concederExecucao(
              operacaoId,
              entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
              transacao,
            );
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'OPERACAO_NAO_DISPONIVEL') {
        return this.resultadoProcessando(operacaoId);
      }
      throw erro;
    }
  }

  private async adquirirAtualizacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    operacaoId: string,
    reconciliacao: boolean,
  ): Promise<ConcessaoAtualizacao | ResultadoOperacaoOrdemServicoErp> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.repositorio.bloquearOrdem(
          entrada.ordemServicoId,
          transacao,
        );
        const ordem = await this.autorizarOrdem(sessao, entrada, transacao);
        if (ordem.versao !== entrada.versaoEsperada) {
          return {
            operacaoId,
            ordemServicoId: entrada.ordemServicoId,
            situacao: 'VERSAO_DESATUALIZADA',
            versao: ordem.versao,
          };
        }
        if (reconciliacao) {
          if (
            !(await this.repositorio.reservaAtualizacaoPertence(
              entrada.ordemServicoId,
              operacaoId,
              transacao,
            ))
          ) {
            throw new Error('RESERVA_ATUALIZACAO_ORDEM_INCONSISTENTE');
          }
        } else if (
          !(await this.repositorio.reservarAtualizacao(
            entrada.ordemServicoId,
            operacaoId,
            entrada.versaoEsperada,
            new Date(),
            transacao,
          ))
        ) {
          return {
            operacaoId,
            ordemServicoId: entrada.ordemServicoId,
            situacao: 'ATUALIZACAO_CONCORRENTE',
            versao: ordem.versao,
          };
        }
        const concessao = reconciliacao
          ? await this.idempotencia.concederReconciliacao(
              operacaoId,
              entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
              transacao,
            )
          : await this.idempotencia.concederExecucao(
              operacaoId,
              entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
              transacao,
            );
        return { ...concessao, ordem };
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'OPERACAO_NAO_DISPONIVEL') {
        return this.resultadoProcessando(operacaoId);
      }
      throw erro;
    }
  }

  private async confirmarCriacao(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    concessao: ConcessaoOperacao,
    ordemServicoExternaId: string,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    if (!this.identificadorExternoValido(ordemServicoExternaId)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'CRIAR_ORDEM_SERVICO',
        'IDENTIFICADOR_ORDEM_INVALIDO',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    const confirmadoEm = new Date();
    const criadoEm = new Date();
    const ordemServicoId = randomUUID();
    await this.prisma.executarTransacao(async (transacao) => {
      await this.autorizarContexto(sessao, this.contexto(entrada), transacao);
      if (
        !(await this.repositorio.criar(
          {
            assunto: entrada.assunto.trim(),
            atendimentoId: entrada.atendimentoId,
            atualizadoEm: criadoEm,
            clienteExternoId: entrada.clienteExternoId.trim(),
            confirmadoEm,
            contratoExternoId: entrada.contratoExternoId.trim(),
            criadoEm,
            descricao: entrada.descricao.trim(),
            descricaoHash: this.hash(entrada.descricao.trim()),
            id: ordemServicoId,
            operacaoCriacaoId: concessao.operacaoId,
            ordemServicoExternaId,
            protocoloOficial: entrada.protocoloOficial.trim(),
            versao: 1,
          },
          transacao,
        ))
      ) {
        throw new Error('ORDEM_SERVICO_CRIACAO_INCONSISTENTE');
      }
      await this.idempotencia.concluir(
        {
          dados: { ordemServicoId, versao: 1 },
          operacaoId: concessao.operacaoId,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'CRIAR_ORDEM_SERVICO',
        'ORDEM_SERVICO_CRIADA',
        'CONFIRMADO',
        transacao,
        ordemServicoId,
      );
    });
    return {
      confirmadoEm,
      operacaoId: concessao.operacaoId,
      ordemServicoExternaId,
      ordemServicoId,
      situacao: 'CONCLUIDA',
      versao: 1,
    };
  }

  private async confirmarAtualizacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    concessao: ConcessaoAtualizacao,
  ): Promise<ResultadoOperacaoOrdemServicoErp> {
    const confirmadoEm = new Date();
    const conteudoHash = this.hash(
      JSON.stringify({
        assunto: entrada.assunto.trim(),
        descricao: entrada.descricao.trim(),
      }),
    );
    await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.bloquearOrdem(
        entrada.ordemServicoId,
        transacao,
      );
      await this.exigirReservaAtualizacao(
        entrada.ordemServicoId,
        concessao.operacaoId,
        transacao,
      );
      if (
        !(await this.repositorio.confirmarAtualizacao(
          {
            assunto: entrada.assunto.trim(),
            confirmadoEm,
            conteudoHash,
            descricao: entrada.descricao.trim(),
            descricaoHash: this.hash(entrada.descricao.trim()),
            operacaoId: concessao.operacaoId,
            ordemServicoId: entrada.ordemServicoId,
            versaoEsperada: entrada.versaoEsperada,
          },
          transacao,
        ))
      ) {
        throw new Error('ATUALIZACAO_ORDEM_SERVICO_INCONSISTENTE');
      }
      await this.idempotencia.concluir(
        {
          dados: {
            ordemServicoId: entrada.ordemServicoId,
            versao: entrada.versaoEsperada + 1,
          },
          operacaoId: concessao.operacaoId,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'ATUALIZAR_ORDEM_SERVICO',
        'ORDEM_SERVICO_ATUALIZADA',
        'CONFIRMADO',
        transacao,
        entrada.ordemServicoId,
      );
      if (
        !(await this.repositorio.liberarReservaAtualizacao(
          entrada.ordemServicoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_ATUALIZACAO_ORDEM_INCONSISTENTE');
      }
    });
    return {
      confirmadoEm,
      operacaoId: concessao.operacaoId,
      ordemServicoId: entrada.ordemServicoId,
      situacao: 'CONCLUIDA',
      versao: entrada.versaoEsperada + 1,
    };
  }

  private async registrarEfeitoAusenteCriacao(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    concessao: ConcessaoOperacao,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.idempotencia.registrarEfeitoAusente(
        {
          operacaoId: concessao.operacaoId,
          proximaAcaoEm: entrada.proximaAcaoEm,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'CRIAR_ORDEM_SERVICO',
        'CRIACAO_ORDEM_SERVICO_EFEITO_AUSENTE',
        'EFEITO_AUSENTE',
        transacao,
      );
    });
  }

  private async registrarEfeitoAusenteAtualizacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    concessao: ConcessaoAtualizacao,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.bloquearOrdem(
        entrada.ordemServicoId,
        transacao,
      );
      await this.exigirReservaAtualizacao(
        entrada.ordemServicoId,
        concessao.operacaoId,
        transacao,
      );
      await this.idempotencia.registrarEfeitoAusente(
        {
          operacaoId: concessao.operacaoId,
          proximaAcaoEm: entrada.proximaAcaoEm,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'ATUALIZAR_ORDEM_SERVICO',
        'ATUALIZACAO_ORDEM_SERVICO_EFEITO_AUSENTE',
        'EFEITO_AUSENTE',
        transacao,
        entrada.ordemServicoId,
      );
      if (
        !(await this.repositorio.liberarReservaAtualizacao(
          entrada.ordemServicoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_ATUALIZACAO_ORDEM_INCONSISTENTE');
      }
    });
  }

  private async marcarIncerto(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    concessao: ConcessaoOperacao,
    acao: 'ATUALIZAR_ORDEM_SERVICO' | 'CRIAR_ORDEM_SERVICO',
    codigo: string,
    ordemServicoId?: string,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.idempotencia.registrarResultadoIncerto(
        {
          codigo,
          operacaoId: concessao.operacaoId,
          proximaAcaoEm: entrada.proximaAcaoEm,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        acao,
        `${acao}_RESULTADO_INCERTO`,
        'RESULTADO_INCERTO',
        transacao,
        ordemServicoId,
      );
    });
  }

  private async marcarFalhaTemporaria(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    concessao: ConcessaoOperacao,
    acao: 'ATUALIZAR_ORDEM_SERVICO' | 'CRIAR_ORDEM_SERVICO',
    codigo: string,
    ordemServicoId?: string,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.idempotencia.registrarFalhaTemporaria(
        {
          codigo,
          operacaoId: concessao.operacaoId,
          proximaAcaoEm: entrada.proximaAcaoEm,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        acao,
        `${acao}_FALHA_TEMPORARIA`,
        'FALHA_TEMPORARIA',
        transacao,
        ordemServicoId,
      );
    });
  }

  private async autorizarContexto(
    sessao: AtorOrdemServicoErp,
    contexto: ContextoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (this.ehAtorFluxo(sessao)) {
      if (
        !(await this.repositorio.contextoEProtocoloCorrespondemParaFluxo(
          contexto,
          sessao.fluxoId,
          sessao.versaoFluxoId,
          transacao,
        ))
      ) {
        throw new Error('CONTEXTO_ORDEM_SERVICO_FLUXO_INVALIDO');
      }
      return;
    }
    await this.autorizacao.autorizar(
      {
        filaId: contexto.filaId,
        permissao: 'CRIAR_ORDEM_SERVICO',
        recurso: { id: contexto.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async (_autorizacao, transacaoAutorizada) => ({
        acessivel:
          transacaoAutorizada !== undefined &&
          (await this.repositorio.contextoEProtocoloCorrespondem(
            contexto,
            transacaoAutorizada,
          )),
        estadoPermiteAcao: true,
      }),
      transacao,
    );
  }

  private async autorizarOrdem(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoOrdemServicoErp,
    transacao: TransacaoPrisma,
  ): Promise<OrdemServicoErpPersistida> {
    const contexto = this.contexto(entrada);
    let ordem: OrdemServicoErpPersistida | undefined;
    await this.autorizacao.autorizar(
      {
        filaId: contexto.filaId,
        permissao: 'CRIAR_ORDEM_SERVICO',
        recurso: { id: contexto.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async (_autorizacao, transacaoAutorizada) => {
        ordem =
          transacaoAutorizada === undefined
            ? undefined
            : await this.repositorio.obterNoContexto(
                entrada.ordemServicoId,
                contexto,
                transacaoAutorizada,
              );
        return { acessivel: ordem !== undefined, estadoPermiteAcao: true };
      },
      transacao,
    );
    if (ordem === undefined) throw new Error('ORDEM_SERVICO_INACESSIVEL');
    return ordem;
  }

  private async auditar(
    sessao: AtorOrdemServicoErp,
    entrada: EntradaCriacaoOrdemServicoErp,
    acao: 'ATUALIZAR_ORDEM_SERVICO' | 'CRIAR_ORDEM_SERVICO',
    tipoEvento: string,
    resultado: string,
    transacao: TransacaoPrisma,
    ordemServicoId?: string,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao,
        atendimentoId: entrada.atendimentoId,
        dadosNovos: { resultado },
        entidadeId: ordemServicoId ?? entrada.atendimentoId,
        entidadeTipo:
          ordemServicoId === undefined ? 'ATENDIMENTO' : 'ORDEM_SERVICO',
        filaId: entrada.filaId,
        ...(this.ehAtorFluxo(sessao)
          ? {
              fluxoId: sessao.fluxoId,
              origem: 'FLUXO' as const,
              versaoFluxoId: sessao.versaoFluxoId,
            }
          : {
              origem: 'USUARIO' as const,
              sessaoId: sessao.sessaoId,
              usuarioId: sessao.usuarioId,
            }),
        tipoEvento,
      },
      transacao,
    );
  }

  private ehAtorFluxo(
    ator: AtorOrdemServicoErp,
  ): ator is AtorFluxoOrdemServicoErp {
    return 'fluxoId' in ator && 'versaoFluxoId' in ator;
  }

  private validarAtor(ator: AtorOrdemServicoErp): void {
    if (
      this.ehAtorFluxo(ator) &&
      (!IDENTIFICADOR_UUID.test(ator.fluxoId) ||
        !IDENTIFICADOR_UUID.test(ator.versaoFluxoId))
    ) {
      throw new ErroEntradaOrdemServicoInvalida();
    }
  }

  private async resultadoCriacaoExistente(
    preparada: ResultadoIdempotencia,
    reconciliacao: boolean,
  ): Promise<ResultadoOperacaoOrdemServicoErp | undefined> {
    if (preparada.operacao.estado === 'CONCLUIDA') {
      const ordem = await this.prisma.executarLeituraConsistente((transacao) =>
        this.repositorio.obterPorOperacaoCriacao(
          preparada.operacao.id,
          transacao,
        ),
      );
      if (ordem === undefined) {
        throw new Error('ORDEM_SERVICO_CRIACAO_INCONSISTENTE');
      }
      return {
        confirmadoEm: ordem.confirmadoEm,
        operacaoId: preparada.operacao.id,
        ordemServicoExternaId: ordem.ordemServicoExternaId,
        ordemServicoId: ordem.id,
        situacao: 'CONCLUIDA',
        versao: 1,
      };
    }
    return this.resultadoEstadoNaoConcluido(preparada, reconciliacao);
  }

  private async resultadoAtualizacaoExistente(
    preparada: ResultadoIdempotencia,
    reconciliacao: boolean,
  ): Promise<ResultadoOperacaoOrdemServicoErp | undefined> {
    if (preparada.operacao.estado === 'CONCLUIDA') {
      const atualizacao = await this.prisma.executarLeituraConsistente(
        (transacao) =>
          this.repositorio.obterAtualizacaoPorOperacao(
            preparada.operacao.id,
            transacao,
          ),
      );
      if (atualizacao === undefined) {
        throw new Error('ATUALIZACAO_ORDEM_SERVICO_INCONSISTENTE');
      }
      return {
        confirmadoEm: atualizacao.confirmadoEm,
        operacaoId: preparada.operacao.id,
        ordemServicoId: atualizacao.ordemServicoId,
        situacao: 'CONCLUIDA',
        versao: atualizacao.versaoResultante,
      };
    }
    return this.resultadoEstadoNaoConcluido(preparada, reconciliacao);
  }

  private resultadoEstadoNaoConcluido(
    preparada: ResultadoIdempotencia,
    reconciliacao: boolean,
  ): ResultadoOperacaoOrdemServicoErp | undefined {
    const { estado, id, proximaAcaoEm } = preparada.operacao;
    if (estado === 'FALHA_DEFINITIVA') {
      return { operacaoId: id, situacao: 'FALHA_DEFINITIVA' };
    }
    if (estado === 'EM_EXECUCAO' || estado === 'EM_RECONCILIACAO') {
      return this.resultadoProcessando(id);
    }
    if (estado === 'RESULTADO_INCERTO') {
      if (!reconciliacao || (proximaAcaoEm !== undefined && proximaAcaoEm > new Date())) {
        return this.resultadoIncerto(id);
      }
      return undefined;
    }
    if (reconciliacao) return this.resultadoAguardando(id);
    if (proximaAcaoEm !== undefined && proximaAcaoEm > new Date()) {
      return this.resultadoAguardando(id);
    }
    return undefined;
  }

  private async exigirReservaAtualizacao(
    ordemServicoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (
      !(await this.repositorio.reservaAtualizacaoPertence(
        ordemServicoId,
        operacaoId,
        transacao,
      ))
    ) {
      throw new Error('RESERVA_ATUALIZACAO_ORDEM_INCONSISTENTE');
    }
  }

  private comandoCriacao(
    entrada: EntradaCriacaoOrdemServicoErp,
  ): ComandoCriarOrdemServicoErp {
    return {
      assunto: entrada.assunto.trim(),
      atendimentoId: entrada.atendimentoId,
      chaveIdempotencia: entrada.chaveIdempotencia,
      clienteExternoId: entrada.clienteExternoId.trim(),
      contratoExternoId: entrada.contratoExternoId.trim(),
      descricao: entrada.descricao.trim(),
      protocoloOficial: entrada.protocoloOficial.trim(),
    };
  }

  private comandoAtualizacao(
    entrada: EntradaAtualizacaoOrdemServicoErp,
    ordem: OrdemServicoErpPersistida,
  ): ComandoAtualizarOrdemServicoErp {
    return {
      ...this.comandoCriacao(entrada),
      ordemServicoExternaId: ordem.ordemServicoExternaId,
    };
  }

  private contexto(
    entrada: EntradaCriacaoOrdemServicoErp,
  ): ContextoOrdemServicoErp {
    return {
      atendimentoId: entrada.atendimentoId,
      clienteExternoId: entrada.clienteExternoId.trim(),
      contratoExternoId: entrada.contratoExternoId.trim(),
      filaId: entrada.filaId,
      protocoloOficial: entrada.protocoloOficial.trim(),
    };
  }

  private assinarCriacao(entrada: EntradaCriacaoOrdemServicoErp): string {
    return this.hash(JSON.stringify(this.comandoCriacao(entrada)));
  }

  private assinarAtualizacao(
    entrada: EntradaAtualizacaoOrdemServicoErp,
  ): string {
    return this.hash(
      JSON.stringify({
        ...this.comandoCriacao(entrada),
        ordemServicoId: entrada.ordemServicoId,
        versaoEsperada: entrada.versaoEsperada,
      }),
    );
  }

  private hash(valor: string): string {
    return createHash('sha256').update(valor, 'utf8').digest('hex');
  }

  private validarCriacao(entrada: EntradaCriacaoOrdemServicoErp): void {
    if (
      !IDENTIFICADOR_UUID.test(entrada.atendimentoId) ||
      !IDENTIFICADOR_UUID.test(entrada.filaId) ||
      !IDENTIFICADOR_UUID.test(entrada.chaveIdempotencia) ||
      entrada.confirmacaoExplicita !== true ||
      !this.identificadorExternoValido(entrada.clienteExternoId) ||
      !this.identificadorExternoValido(entrada.contratoExternoId) ||
      !this.identificadorExternoValido(entrada.protocoloOficial) ||
      !this.textoValido(entrada.assunto, 200) ||
      !this.textoValido(entrada.descricao, 4_000) ||
      !(entrada.proximaAcaoEm instanceof Date) ||
      Number.isNaN(entrada.proximaAcaoEm.getTime()) ||
      entrada.proximaAcaoEm <= new Date()
    ) {
      throw new ErroEntradaOrdemServicoInvalida();
    }
  }

  private validarAtualizacao(
    entrada: EntradaAtualizacaoOrdemServicoErp,
  ): void {
    this.validarCriacao(entrada);
    if (
      !IDENTIFICADOR_UUID.test(entrada.ordemServicoId) ||
      !Number.isInteger(entrada.versaoEsperada) ||
      entrada.versaoEsperada < 1
    ) {
      throw new ErroEntradaOrdemServicoInvalida();
    }
  }

  private identificadorExternoValido(valor: unknown): valor is string {
    return (
      typeof valor === 'string' &&
      valor.trim().length > 0 &&
      valor.length <= IDENTIFICADOR_EXTERNO_MAXIMO &&
      !valor.includes('\u0000')
    );
  }

  private textoValido(valor: unknown, limite: number): valor is string {
    return (
      typeof valor === 'string' &&
      valor.trim().length > 0 &&
      valor.length <= limite &&
      !valor.includes('\u0000')
    );
  }

  private resultadoCriacaoValido(resultado: unknown): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta = resultado as ResultadoCriacaoOrdemServicoErp;
    const chaves = Object.keys(resultado);
    if (resposta.resultado === 'CONFIRMADO') {
      return (
        chaves.length === 2 &&
        this.identificadorExternoValido(resposta.ordemServicoExternaId)
      );
    }
    return this.resultadoEscritaNaoConfirmadoValido(resposta, chaves.length);
  }

  private resultadoAtualizacaoValido(resultado: unknown): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta = resultado as ResultadoAtualizacaoOrdemServicoErp;
    const chaves = Object.keys(resultado);
    if (resposta.resultado === 'CONFIRMADO') return chaves.length === 1;
    return this.resultadoEscritaNaoConfirmadoValido(resposta, chaves.length);
  }

  private resultadoEscritaNaoConfirmadoValido(
    resposta:
      | ResultadoAtualizacaoOrdemServicoErp
      | ResultadoCriacaoOrdemServicoErp,
    quantidadeChaves: number,
  ): boolean {
    if (resposta.resultado === 'INDISPONIVEL') {
      return (
        quantidadeChaves === 3 &&
        resposta.codigo === 'ERP_INDISPONIVEL' &&
        resposta.efeitoExternoPossivel === false
      );
    }
    return (
      resposta.resultado === 'RESULTADO_INCERTO' &&
      quantidadeChaves === 3 &&
      resposta.codigo === 'RESPOSTA_PERDIDA' &&
      resposta.requerReconciliacao === true
    );
  }

  private resultadoReconciliacaoCriacaoValido(resultado: unknown): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta = resultado as ResultadoReconciliacaoCriacaoOrdemServicoErp;
    const chaves = Object.keys(resultado);
    if (resposta.resultado === 'CONFIRMADO') {
      return (
        chaves.length === 2 &&
        this.identificadorExternoValido(resposta.ordemServicoExternaId)
      );
    }
    return this.resultadoReconciliacaoNaoConfirmadoValido(
      resposta,
      chaves.length,
    );
  }

  private resultadoReconciliacaoAtualizacaoValido(
    resultado: unknown,
  ): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta =
      resultado as ResultadoReconciliacaoAtualizacaoOrdemServicoErp;
    const chaves = Object.keys(resultado);
    if (resposta.resultado === 'CONFIRMADO') return chaves.length === 1;
    return this.resultadoReconciliacaoNaoConfirmadoValido(
      resposta,
      chaves.length,
    );
  }

  private resultadoReconciliacaoNaoConfirmadoValido(
    resposta:
      | ResultadoReconciliacaoAtualizacaoOrdemServicoErp
      | ResultadoReconciliacaoCriacaoOrdemServicoErp,
    quantidadeChaves: number,
  ): boolean {
    if (resposta.resultado === 'EFEITO_AUSENTE') {
      return quantidadeChaves === 1;
    }
    return (
      resposta.resultado === 'INDISPONIVEL' &&
      quantidadeChaves === 2 &&
      resposta.codigo === 'ERP_INDISPONIVEL'
    );
  }

  private resultadoIncerto(
    operacaoId: string,
  ): ResultadoOperacaoOrdemServicoErp {
    return { operacaoId, situacao: 'RECONCILIACAO_NECESSARIA' };
  }

  private resultadoAguardando(
    operacaoId: string,
  ): ResultadoOperacaoOrdemServicoErp {
    return { operacaoId, situacao: 'AGUARDANDO_NOVA_TENTATIVA' };
  }

  private resultadoProcessando(
    operacaoId: string,
  ): ResultadoOperacaoOrdemServicoErp {
    return { operacaoId, situacao: 'PROCESSAMENTO_EM_CURSO' };
  }
}
