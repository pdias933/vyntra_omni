import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import type { AdaptadorErp } from '../erp/adaptador-erp.js';
import type {
  ResultadoExecucaoDesbloqueioConfiancaErp,
  ResultadoReconciliacaoDesbloqueioConfiancaErp,
} from '../erp/modelo-erp.js';
import type {
  ConcessaoOperacao,
  EstadoOperacaoRecuperavel,
  ResultadoIdempotencia,
} from '../idempotencia/modelo-idempotencia.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroEntradaDesbloqueioConfiancaInvalida } from './erros-desbloqueio-confianca.js';
import type {
  AtorFluxoDesbloqueioConfianca,
  EntradaExecucaoDesbloqueioConfianca,
  ResultadoExecucaoDesbloqueioConfianca,
} from './modelo-desbloqueio-confianca.js';
import {
  REPOSITORIO_DESBLOQUEIOS_CONFIANCA,
  type RepositorioDesbloqueiosConfianca,
} from './repositorio-desbloqueios-confianca.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from './servico-elegibilidade-desbloqueio-confianca.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DURACAO_CONCESSAO_PADRAO_MS = 60_000;

type AtorDesbloqueioConfianca =
  | ContextoSessaoAutorizacao
  | AtorFluxoDesbloqueioConfianca;

@Injectable()
export class ServicoExecucaoDesbloqueioConfianca {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoIdempotencia)
    private readonly idempotencia: ServicoIdempotencia,
    @Inject(ServicoElegibilidadeDesbloqueioConfianca)
    private readonly elegibilidade: ServicoElegibilidadeDesbloqueioConfianca,
    @Inject(REPOSITORIO_DESBLOQUEIOS_CONFIANCA)
    private readonly repositorio: RepositorioDesbloqueiosConfianca,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async executar(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    adaptador: AdaptadorErp,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca> {
    this.validarAtor(sessao);
    this.validarEntrada(entrada, this.ehAtorFluxo(sessao));
    const preparada = await this.preparar(sessao, entrada);
    const existente = await this.resultadoExistente(preparada);
    if (existente !== undefined) return existente;

    const elegibilidade = await this.elegibilidade.verificarParaExecucao(
      sessao,
      entrada,
      adaptador,
    );
    if (elegibilidade.resultado === 'INDISPONIVEL') {
      return {
        codigo: elegibilidade.codigo,
        operacaoId: preparada.operacao.id,
        situacao: 'INTEGRACAO_INDISPONIVEL',
      };
    }
    if (elegibilidade.resultado === 'NAO_ENCONTRADO') {
      return {
        operacaoId: preparada.operacao.id,
        situacao: 'RECURSO_NAO_ENCONTRADO',
      };
    }
    if (!elegibilidade.elegivel) {
      return {
        motivos: elegibilidade.motivos,
        operacaoId: preparada.operacao.id,
        situacao: 'INELEGIVEL',
      };
    }

    const aquisicao = await this.adquirirExecucao(
      sessao,
      entrada,
      preparada.operacao.id,
    );
    if (!('tokenConcessao' in aquisicao)) return aquisicao;

    let resultado: ResultadoExecucaoDesbloqueioConfiancaErp;
    try {
      resultado = await adaptador.executarDesbloqueioConfianca({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        contratoExternoId: entrada.contratoExternoId,
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        aquisicao,
        'FALHA_ADAPTADOR_INESPERADA',
      );
      return {
        operacaoId: aquisicao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (!this.resultadoExecucaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        aquisicao,
        'RESPOSTA_EXECUCAO_INVALIDA',
      );
      return {
        operacaoId: aquisicao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmar(
        sessao,
        entrada,
        aquisicao,
        new Date(),
      );
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.marcarIncerto(
        sessao,
        entrada,
        aquisicao,
        resultado.codigo,
      );
      return {
        operacaoId: aquisicao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    await this.marcarFalhaTemporaria(
      sessao,
      entrada,
      aquisicao,
      resultado.codigo,
    );
    return {
      operacaoId: aquisicao.operacaoId,
      situacao: 'AGUARDANDO_NOVA_TENTATIVA',
    };
  }

  public async reconciliar(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    adaptador: AdaptadorErp,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca> {
    this.validarAtor(sessao);
    this.validarEntrada(entrada, this.ehAtorFluxo(sessao));
    const preparada = await this.preparar(sessao, entrada);
    const existente = await this.resultadoAntesDaReconciliacao(preparada);
    if (existente !== undefined) return existente;

    const aquisicao = await this.adquirirReconciliacao(
      sessao,
      entrada,
      preparada.operacao.id,
    );
    if (!('tokenConcessao' in aquisicao)) return aquisicao;

    let resultado: ResultadoReconciliacaoDesbloqueioConfiancaErp;
    try {
      resultado = await adaptador.reconciliarDesbloqueioConfianca({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        contratoExternoId: entrada.contratoExternoId,
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        aquisicao,
        'FALHA_RECONCILIACAO_INESPERADA',
      );
      return {
        operacaoId: aquisicao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (!this.resultadoReconciliacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        aquisicao,
        'RESPOSTA_RECONCILIACAO_INVALIDA',
      );
      return {
        operacaoId: aquisicao.operacaoId,
        situacao: 'RECONCILIACAO_NECESSARIA',
      };
    }

    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmar(
        sessao,
        entrada,
        aquisicao,
        new Date(),
      );
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      return this.registrarEfeitoAusente(sessao, entrada, aquisicao);
    }

    await this.marcarIncerto(
      sessao,
      entrada,
      aquisicao,
      resultado.codigo,
    );
    return {
      operacaoId: aquisicao.operacaoId,
      situacao: 'RECONCILIACAO_NECESSARIA',
    };
  }

  private async preparar(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
  ): Promise<ResultadoIdempotencia> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.elegibilidade.autorizarExecucaoEObterUltimo(
        sessao,
        entrada,
        transacao,
      );
      return this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinar(entrada),
          chaveIdempotencia: entrada.chaveIdempotencia,
          entidadeId: entrada.atendimentoId,
          entidadeTipo: 'ATENDIMENTO',
          escopoId: entrada.atendimentoId,
          escopoTipo: 'ATENDIMENTO',
          tipoOperacao: 'EXECUTAR_DESBLOQUEIO_CONFIANCA',
        },
        transacao,
      );
    });
  }

  private async adquirirExecucao(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    operacaoId: string,
  ): Promise<ConcessaoOperacao | ResultadoExecucaoDesbloqueioConfianca> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.repositorio.bloquearContrato(
          entrada.contratoExternoId,
          transacao,
        );
        const ultimo = await this.elegibilidade.autorizarExecucaoEObterUltimo(
          sessao,
          entrada,
          transacao,
        );
        if (!this.elegibilidade.intervaloLocalPermite(ultimo, new Date())) {
          return {
            motivos: ['INTERVALO_30_DIAS'],
            operacaoId,
            situacao: 'INELEGIVEL',
          };
        }
        if (
          !(await this.repositorio.reservar(
            entrada.contratoExternoId,
            entrada.atendimentoId,
            operacaoId,
            new Date(),
            transacao,
          ))
        ) {
          return { operacaoId, situacao: 'DESBLOQUEIO_CONCORRENTE' };
        }
        return this.idempotencia.concederExecucao(
          operacaoId,
          entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
          transacao,
        );
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'OPERACAO_NAO_DISPONIVEL') {
        return { operacaoId, situacao: 'PROCESSAMENTO_EM_CURSO' };
      }
      throw erro;
    }
  }

  private async adquirirReconciliacao(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    operacaoId: string,
  ): Promise<ConcessaoOperacao | ResultadoExecucaoDesbloqueioConfianca> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.repositorio.bloquearContrato(
          entrada.contratoExternoId,
          transacao,
        );
        await this.elegibilidade.autorizarExecucaoEObterUltimo(
          sessao,
          entrada,
          transacao,
        );
        if (
          !(await this.repositorio.reservaPertence(
            entrada.contratoExternoId,
            operacaoId,
            transacao,
          ))
        ) {
          throw new Error('RESERVA_DESBLOQUEIO_INCONSISTENTE');
        }
        return this.idempotencia.concederReconciliacao(
          operacaoId,
          entrada.duracaoConcessaoMs ?? DURACAO_CONCESSAO_PADRAO_MS,
          transacao,
        );
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'OPERACAO_NAO_DISPONIVEL') {
        return { operacaoId, situacao: 'PROCESSAMENTO_EM_CURSO' };
      }
      throw erro;
    }
  }

  private async confirmar(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    concessao: ConcessaoOperacao,
    confirmadoEm: Date,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.bloquearContrato(
        entrada.contratoExternoId,
        transacao,
      );
      await this.exigirReserva(entrada, concessao.operacaoId, transacao);
      const criadoEm = new Date();
      if (
        !(await this.repositorio.registrarConfirmado(
          entrada.atendimentoId,
          entrada.contratoExternoId,
          concessao.operacaoId,
          confirmadoEm,
          criadoEm,
          transacao,
        ))
      ) {
        throw new Error('REGISTRO_DESBLOQUEIO_INCONSISTENTE');
      }
      await this.idempotencia.concluir(
        {
          dados: { confirmadoEm: confirmadoEm.toISOString() },
          operacaoId: concessao.operacaoId,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'DESBLOQUEIO_CONFIANCA_CONFIRMADO',
        'CONFIRMADO',
        transacao,
      );
      if (
        !(await this.repositorio.liberarReserva(
          entrada.contratoExternoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_DESBLOQUEIO_INCONSISTENTE');
      }
    });
    return {
      confirmadoEm,
      operacaoId: concessao.operacaoId,
      situacao: 'CONCLUIDO',
    };
  }

  private async registrarEfeitoAusente(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    concessao: ConcessaoOperacao,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca> {
    await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.bloquearContrato(
        entrada.contratoExternoId,
        transacao,
      );
      await this.exigirReserva(entrada, concessao.operacaoId, transacao);
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
        'DESBLOQUEIO_CONFIANCA_EFEITO_AUSENTE',
        'EFEITO_AUSENTE',
        transacao,
      );
      if (
        !(await this.repositorio.liberarReserva(
          entrada.contratoExternoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_DESBLOQUEIO_INCONSISTENTE');
      }
    });
    return {
      operacaoId: concessao.operacaoId,
      situacao: 'AGUARDANDO_NOVA_TENTATIVA',
    };
  }

  private async marcarIncerto(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    concessao: ConcessaoOperacao,
    codigo: string,
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
        'DESBLOQUEIO_CONFIANCA_RESULTADO_INCERTO',
        'RESULTADO_INCERTO',
        transacao,
      );
    });
  }

  private async marcarFalhaTemporaria(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    concessao: ConcessaoOperacao,
    codigo: string,
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
        'DESBLOQUEIO_CONFIANCA_FALHA_TEMPORARIA',
        'FALHA_TEMPORARIA',
        transacao,
      );
    });
  }

  private async auditar(
    sessao: AtorDesbloqueioConfianca,
    entrada: EntradaExecucaoDesbloqueioConfianca,
    tipoEvento: string,
    resultado: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao: 'EXECUTAR_DESBLOQUEIO_CONFIANCA',
        atendimentoId: entrada.atendimentoId,
        dadosNovos: { resultado },
        entidadeId: entrada.atendimentoId,
        entidadeTipo: 'DESBLOQUEIO_CONFIANCA',
        ...(entrada.filaId === undefined ? {} : { filaId: entrada.filaId }),
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

  private async exigirReserva(
    entrada: EntradaExecucaoDesbloqueioConfianca,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (
      !(await this.repositorio.reservaPertence(
        entrada.contratoExternoId,
        operacaoId,
        transacao,
      ))
    ) {
      throw new Error('RESERVA_DESBLOQUEIO_INCONSISTENTE');
    }
  }

  private async resultadoExistente(
    preparada: ResultadoIdempotencia,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca | undefined> {
    const basico = this.mapearEstado(preparada.operacao.estado);
    if (basico === undefined) {
      if (
        preparada.operacao.proximaAcaoEm !== undefined &&
        preparada.operacao.proximaAcaoEm > new Date()
      ) {
        return {
          operacaoId: preparada.operacao.id,
          situacao: 'AGUARDANDO_NOVA_TENTATIVA',
        };
      }
      return undefined;
    }
    if (basico.situacao !== 'CONCLUIDO') {
      return { ...basico, operacaoId: preparada.operacao.id };
    }
    const confirmado = await this.prisma.executarLeituraConsistente(
      (transacao) =>
        this.repositorio.obterConfirmadoPorOperacao(
          preparada.operacao.id,
          transacao,
        ),
    );
    if (confirmado === undefined) {
      throw new Error('REGISTRO_DESBLOQUEIO_INCONSISTENTE');
    }
    return {
      confirmadoEm: confirmado.confirmadoEm,
      operacaoId: preparada.operacao.id,
      situacao: 'CONCLUIDO',
    };
  }

  private async resultadoAntesDaReconciliacao(
    preparada: ResultadoIdempotencia,
  ): Promise<ResultadoExecucaoDesbloqueioConfianca | undefined> {
    if (
      preparada.operacao.estado === 'PENDENTE' ||
      preparada.operacao.estado === 'AGUARDANDO_NOVA_TENTATIVA'
    ) {
      return {
        operacaoId: preparada.operacao.id,
        situacao: 'AGUARDANDO_NOVA_TENTATIVA',
      };
    }
    if (preparada.operacao.estado === 'RESULTADO_INCERTO') {
      if (
        preparada.operacao.proximaAcaoEm !== undefined &&
        preparada.operacao.proximaAcaoEm > new Date()
      ) {
        return {
          operacaoId: preparada.operacao.id,
          situacao: 'RECONCILIACAO_NECESSARIA',
        };
      }
      return undefined;
    }
    if (preparada.operacao.estado === 'EM_RECONCILIACAO') {
      return {
        operacaoId: preparada.operacao.id,
        situacao: 'PROCESSAMENTO_EM_CURSO',
      };
    }
    return this.resultadoExistente(preparada);
  }

  private mapearEstado(
    estado: EstadoOperacaoRecuperavel,
  ): ResultadoExecucaoDesbloqueioConfianca | undefined {
    if (estado === 'CONCLUIDA') return { situacao: 'CONCLUIDO' };
    if (estado === 'FALHA_DEFINITIVA') {
      return { situacao: 'FALHA_DEFINITIVA' };
    }
    if (estado === 'RESULTADO_INCERTO' || estado === 'EM_RECONCILIACAO') {
      return { situacao: 'RECONCILIACAO_NECESSARIA' };
    }
    if (estado === 'EM_EXECUCAO') {
      return { situacao: 'PROCESSAMENTO_EM_CURSO' };
    }
    return undefined;
  }

  private resultadoExecucaoValido(
    resultado: unknown,
  ): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta = resultado as ResultadoExecucaoDesbloqueioConfiancaErp;
    const chaves = Object.keys(resultado);
    if (resposta.resultado === 'CONFIRMADO') return chaves.length === 1;
    if (resposta.resultado === 'INDISPONIVEL') {
      return (
        chaves.length === 3 &&
        resposta.codigo === 'ERP_INDISPONIVEL' &&
        resposta.efeitoExternoPossivel === false
      );
    }
    return (
      resposta.resultado === 'RESULTADO_INCERTO' &&
      chaves.length === 3 &&
      resposta.codigo === 'RESPOSTA_PERDIDA' &&
      resposta.requerReconciliacao === true
    );
  }

  private resultadoReconciliacaoValido(
    resultado: unknown,
  ): boolean {
    if (resultado === null || typeof resultado !== 'object') return false;
    const resposta = resultado as ResultadoReconciliacaoDesbloqueioConfiancaErp;
    const chaves = Object.keys(resultado);
    if (
      resposta.resultado === 'CONFIRMADO' ||
      resposta.resultado === 'EFEITO_AUSENTE'
    ) {
      return chaves.length === 1;
    }
    return (
      resposta.resultado === 'INDISPONIVEL' &&
      chaves.length === 2 &&
      resposta.codigo === 'ERP_INDISPONIVEL'
    );
  }

  private validarEntrada(
    entrada: EntradaExecucaoDesbloqueioConfianca,
    origemFluxo = false,
  ): void {
    if (
      !IDENTIFICADOR_UUID.test(entrada.atendimentoId) ||
      (origemFluxo
        ? entrada.filaId !== undefined
        : entrada.filaId === undefined ||
          !IDENTIFICADOR_UUID.test(entrada.filaId)) ||
      !IDENTIFICADOR_UUID.test(entrada.chaveIdempotencia) ||
      entrada.confirmacaoExplicita !== true ||
      entrada.contratoExternoId.trim().length < 1 ||
      entrada.contratoExternoId.length > 256 ||
      !(entrada.proximaAcaoEm instanceof Date) ||
      Number.isNaN(entrada.proximaAcaoEm.getTime()) ||
      entrada.proximaAcaoEm <= new Date()
    ) {
      throw new ErroEntradaDesbloqueioConfiancaInvalida();
    }
  }

  private ehAtorFluxo(
    ator: AtorDesbloqueioConfianca,
  ): ator is AtorFluxoDesbloqueioConfianca {
    return 'fluxoId' in ator && 'versaoFluxoId' in ator;
  }

  private validarAtor(ator: AtorDesbloqueioConfianca): void {
    if (
      this.ehAtorFluxo(ator) &&
      (!IDENTIFICADOR_UUID.test(ator.fluxoId) ||
        !IDENTIFICADOR_UUID.test(ator.versaoFluxoId))
    ) {
      throw new ErroEntradaDesbloqueioConfiancaInvalida();
    }
  }

  private assinar(entrada: EntradaExecucaoDesbloqueioConfianca): string {
    const canonico = JSON.stringify({
      atendimentoId: entrada.atendimentoId,
      contratoExternoId: entrada.contratoExternoId,
    });
    return createHash('sha256').update(canonico, 'utf8').digest('hex');
  }
}
