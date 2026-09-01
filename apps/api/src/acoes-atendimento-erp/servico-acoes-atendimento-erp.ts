import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { MaquinaEstadoAtendimento } from '../atendimentos/maquina-estado-atendimento.js';
import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { EscritasErp } from '../erp/adaptador-erp.js';
import type {
  ResultadoAcaoAtendimentoErp as ResultadoAdaptadorAcaoAtendimentoErp,
  ResultadoReconciliacaoAcaoAtendimentoErp,
} from '../erp/modelo-erp.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type {
  ConcessaoOperacao,
  ResultadoIdempotencia,
} from '../idempotencia/modelo-idempotencia.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroEntradaAcaoAtendimentoErpInvalida } from './erros-acoes-atendimento-erp.js';
import type {
  ContextoAcaoAtendimentoErp,
  ContextoAtendimentoErpPersistido,
  EntradaComentarioAtendimentoErp,
  EntradaEncerramentoAtendimentoErp,
  ResultadoAcaoAtendimentoErp,
  TipoAcaoAtendimentoErp,
} from './modelo-acoes-atendimento-erp.js';
import {
  REPOSITORIO_ACOES_ATENDIMENTO_ERP,
  type RepositorioAcoesAtendimentoErp,
} from './repositorio-acoes-atendimento-erp.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{16,128}$/u;
const DURACAO_CONCESSAO_PADRAO_MS = 60_000;

@Injectable()
export class ServicoAcoesAtendimentoErp {
  private readonly maquina = new MaquinaEstadoAtendimento();

  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoIdempotencia)
    private readonly idempotencia: ServicoIdempotencia,
    @Inject(REPOSITORIO_ACOES_ATENDIMENTO_ERP)
    private readonly repositorio: RepositorioAcoesAtendimentoErp,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async adicionarComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarComentario(entrada);
    const preparada = await this.prepararComentario(sessao, entrada);
    const existente = await this.resultadoExistente(
      preparada,
      'COMENTARIO',
      false,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirComentario(
      sessao,
      entrada,
      preparada.operacao.id,
      false,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoAdaptadorAcaoAtendimentoErp;
    try {
      resultado = await adaptador.adicionarComentarioAtendimento({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        comentario: entrada.comentario.trim(),
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    return this.processarResultadoComentario(
      sessao,
      entrada,
      concessao,
      resultado,
    );
  }

  public async reconciliarComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarComentario(entrada);
    const preparada = await this.prepararComentario(sessao, entrada);
    const existente = await this.resultadoExistente(
      preparada,
      'COMENTARIO',
      true,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirComentario(
      sessao,
      entrada,
      preparada.operacao.id,
      true,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoReconciliacaoAcaoAtendimentoErp;
    try {
      resultado = await adaptador.reconciliarComentarioAtendimento({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RECONCILIAR_COMENTARIO_ATENDIMENTO_ERP',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoReconciliacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RESPOSTA_RECONCILIACAO_COMENTARIO_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarComentario(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      await this.registrarEfeitoAusente(
        sessao,
        entrada,
        concessao,
        'COMENTARIO',
      );
      return this.resultadoAguardando(concessao.operacaoId);
    }
    await this.marcarIncerto(
      sessao,
      entrada,
      concessao,
      resultado.codigo,
    );
    return this.resultadoIncerto(concessao.operacaoId);
  }

  public async encerrar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarEncerramento(entrada);
    const preparada = await this.prepararEncerramento(sessao, entrada);
    const existente = await this.resultadoExistente(
      preparada,
      'ENCERRAMENTO',
      false,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirEncerramento(
      sessao,
      entrada,
      preparada.operacao.id,
      false,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoAdaptadorAcaoAtendimentoErp;
    try {
      resultado = await adaptador.encerrarAtendimento({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        motivo: entrada.motivo.trim(),
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'ENCERRAR_ATENDIMENTO_ERP',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    return this.processarResultadoEncerramento(
      sessao,
      entrada,
      concessao,
      resultado,
    );
  }

  public async reconciliarEncerramento(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
    adaptador: EscritasErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarEncerramento(entrada);
    const preparada = await this.prepararEncerramento(sessao, entrada);
    const existente = await this.resultadoExistente(
      preparada,
      'ENCERRAMENTO',
      true,
    );
    if (existente !== undefined) return existente;
    const concessao = await this.adquirirEncerramento(
      sessao,
      entrada,
      preparada.operacao.id,
      true,
    );
    if (!('tokenConcessao' in concessao)) return concessao;

    let resultado: ResultadoReconciliacaoAcaoAtendimentoErp;
    try {
      resultado = await adaptador.reconciliarEncerramentoAtendimento({
        atendimentoId: entrada.atendimentoId,
        chaveIdempotencia: entrada.chaveIdempotencia,
        protocoloOficial: entrada.protocoloOficial.trim(),
      });
    } catch {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RECONCILIAR_ENCERRAMENTO_ATENDIMENTO_ERP',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (!this.resultadoReconciliacaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RESPOSTA_RECONCILIACAO_ENCERRAMENTO_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarEncerramento(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'EFEITO_AUSENTE') {
      await this.registrarEfeitoAusente(
        sessao,
        entrada,
        concessao,
        'ENCERRAMENTO',
      );
      return this.resultadoAguardando(concessao.operacaoId);
    }
    await this.marcarIncerto(
      sessao,
      entrada,
      concessao,
      resultado.codigo,
    );
    return this.resultadoIncerto(concessao.operacaoId);
  }

  private async processarResultadoComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
    concessao: ConcessaoOperacao,
    resultado: ResultadoAdaptadorAcaoAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    if (!this.resultadoAcaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RESPOSTA_COMENTARIO_ATENDIMENTO_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarComentario(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        resultado.codigo,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    await this.marcarFalhaTemporaria(
      sessao,
      entrada,
      concessao,
      resultado.codigo,
    );
    return this.resultadoAguardando(concessao.operacaoId);
  }

  private async processarResultadoEncerramento(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
    concessao: ConcessaoOperacao,
    resultado: ResultadoAdaptadorAcaoAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    if (!this.resultadoAcaoValido(resultado)) {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        'RESPOSTA_ENCERRAMENTO_ATENDIMENTO_INVALIDA',
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    if (resultado.resultado === 'CONFIRMADO') {
      return this.confirmarEncerramento(sessao, entrada, concessao);
    }
    if (resultado.resultado === 'RESULTADO_INCERTO') {
      await this.marcarIncerto(
        sessao,
        entrada,
        concessao,
        resultado.codigo,
      );
      return this.resultadoIncerto(concessao.operacaoId);
    }
    await this.marcarFalhaTemporaria(
      sessao,
      entrada,
      concessao,
      resultado.codigo,
    );
    return this.resultadoAguardando(concessao.operacaoId);
  }

  private async prepararComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
  ): Promise<ResultadoIdempotencia> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.autorizar(sessao, entrada, false, transacao);
      return this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinar({
            comentario: entrada.comentario.trim(),
            contexto: this.contexto(entrada),
          }),
          chaveIdempotencia: entrada.chaveIdempotencia,
          entidadeId: entrada.atendimentoId,
          entidadeTipo: 'ATENDIMENTO',
          escopoId: entrada.atendimentoId,
          escopoTipo: 'ATENDIMENTO',
          tipoOperacao: 'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP',
        },
        transacao,
      );
    });
  }

  private async prepararEncerramento(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
  ): Promise<ResultadoIdempotencia> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.autorizar(sessao, entrada, false, transacao);
      return this.idempotencia.iniciarOuObter(
        {
          assinaturaRequisicaoHash: this.assinar({
            contexto: this.contexto(entrada),
            motivo: entrada.motivo.trim(),
            versaoAtribuicaoEsperada: entrada.versaoAtribuicaoEsperada,
            versaoEstadoEsperada: entrada.versaoEstadoEsperada,
          }),
          chaveIdempotencia: entrada.chaveIdempotencia,
          entidadeId: entrada.atendimentoId,
          entidadeTipo: 'ATENDIMENTO',
          escopoId: entrada.atendimentoId,
          escopoTipo: 'ATENDIMENTO',
          tipoOperacao: 'ENCERRAR_ATENDIMENTO_ERP',
        },
        transacao,
      );
    });
  }

  private async adquirirComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
    operacaoId: string,
    reconciliacao: boolean,
  ): Promise<ConcessaoOperacao | ResultadoAcaoAtendimentoErp> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.autorizar(sessao, entrada, true, transacao);
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

  private async adquirirEncerramento(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
    operacaoId: string,
    reconciliacao: boolean,
  ): Promise<ConcessaoOperacao | ResultadoAcaoAtendimentoErp> {
    try {
      return await this.prisma.executarTransacao(async (transacao) => {
        await this.repositorio.bloquearAtendimento(
          entrada.atendimentoId,
          transacao,
        );
        const contexto = await this.autorizar(sessao, entrada, true, transacao);
        const atual = contexto.atendimento;
        if (
          atual.versaoEstado !== entrada.versaoEstadoEsperada ||
          atual.versaoAtribuicao !== entrada.versaoAtribuicaoEsperada
        ) {
          return {
            operacaoId,
            situacao: 'VERSAO_DESATUALIZADA',
            versaoAtribuicao: atual.versaoAtribuicao,
            versaoEstado: atual.versaoEstado,
          };
        }
        if (reconciliacao) {
          if (
            !(await this.repositorio.reservaEncerramentoPertence(
              entrada.atendimentoId,
              operacaoId,
              transacao,
            ))
          ) {
            throw new Error('RESERVA_ENCERRAMENTO_ERP_INCONSISTENTE');
          }
        } else if (
          !(await this.repositorio.reservarEncerramento(
            entrada.atendimentoId,
            operacaoId,
            entrada.versaoEstadoEsperada,
            entrada.versaoAtribuicaoEsperada,
            new Date(),
            transacao,
          ))
        ) {
          return {
            operacaoId,
            situacao: 'ENCERRAMENTO_CONCORRENTE',
            versaoAtribuicao: atual.versaoAtribuicao,
            versaoEstado: atual.versaoEstado,
          };
        }
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

  private async confirmarComentario(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp,
    concessao: ConcessaoOperacao,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    const confirmadoEm = new Date();
    await this.prisma.executarTransacao(async (transacao) => {
      if (
        (await this.repositorio.obterPorAtendimentoEProtocolo(
          entrada.atendimentoId,
          entrada.protocoloOficial.trim(),
          transacao,
        )) === undefined ||
        !(await this.repositorio.registrar(
          {
            atendimentoId: entrada.atendimentoId,
            confirmadoEm,
            conteudoHash: this.hash(entrada.comentario.trim()),
            operacaoId: concessao.operacaoId,
            protocoloOficial: entrada.protocoloOficial.trim(),
            tipo: 'COMENTARIO',
          },
          transacao,
        ))
      ) {
        throw new Error('COMENTARIO_ATENDIMENTO_ERP_INCONSISTENTE');
      }
      await this.idempotencia.concluir(
        {
          dados: { atendimentoId: entrada.atendimentoId },
          operacaoId: concessao.operacaoId,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP',
        'COMENTARIO_ATENDIMENTO_ERP_CONFIRMADO',
        'CONFIRMADO',
        transacao,
      );
    });
    return {
      confirmadoEm,
      operacaoId: concessao.operacaoId,
      situacao: 'CONCLUIDA',
    };
  }

  private async confirmarEncerramento(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaEncerramentoAtendimentoErp,
    concessao: ConcessaoOperacao,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    const confirmadoEm = new Date();
    let versaoAtribuicao = entrada.versaoAtribuicaoEsperada;
    let versaoEstado = entrada.versaoEstadoEsperada;
    await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.bloquearAtendimento(
        entrada.atendimentoId,
        transacao,
      );
      await this.exigirReserva(
        entrada.atendimentoId,
        concessao.operacaoId,
        transacao,
      );
      const contexto = await this.repositorio.obterPorAtendimentoEProtocolo(
        entrada.atendimentoId,
        entrada.protocoloOficial.trim(),
        transacao,
      );
      if (contexto === undefined) {
        throw new Error('ATENDIMENTO_ERP_INCONSISTENTE');
      }
      const atual = contexto.atendimento;
      if (['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atual.estado)) {
        const proximo = this.maquina.transitar(
          atual,
          {
            atorId: sessao.usuarioId,
            motivo: entrada.motivo.trim(),
            origem: 'USUARIO',
            tipo: 'ENCERRAR',
          },
          confirmadoEm,
        );
        if (
          !(await this.repositorio.confirmarEncerramento(
            atual,
            proximo,
            transacao,
          ))
        ) {
          throw new Error('ENCERRAMENTO_ATENDIMENTO_ERP_CONCORRENTE');
        }
        await this.repositorio.finalizarAtribuicaoAberta(
          entrada.atendimentoId,
          confirmadoEm,
          transacao,
        );
        await this.eventos.acrescentar(
          {
            atendimentoId: entrada.atendimentoId,
            classificacaoDados: 'OPERACIONAL',
            conversaId: proximo.conversaId,
            dados: {
              estado: proximo.estado,
              versaoAtribuicao: proximo.versaoAtribuicao,
              versaoEstado: proximo.versaoEstado,
            },
            entidadeId: entrada.atendimentoId,
            entidadeTipo: 'ATENDIMENTO',
            tipo: 'ATENDIMENTO_ENCERRADO',
            usuarioAtorId: sessao.usuarioId,
          },
          transacao,
        );
        versaoAtribuicao = proximo.versaoAtribuicao;
        versaoEstado = proximo.versaoEstado;
      } else {
        versaoAtribuicao = atual.versaoAtribuicao;
        versaoEstado = atual.versaoEstado;
      }
      if (
        !(await this.repositorio.registrar(
          {
            atendimentoId: entrada.atendimentoId,
            confirmadoEm,
            conteudoHash: this.hash(entrada.motivo.trim()),
            operacaoId: concessao.operacaoId,
            protocoloOficial: entrada.protocoloOficial.trim(),
            tipo: 'ENCERRAMENTO',
            versaoAtribuicaoResultante: versaoAtribuicao,
            versaoEstadoResultante: versaoEstado,
          },
          transacao,
        ))
      ) {
        throw new Error('REGISTRO_ENCERRAMENTO_ATENDIMENTO_ERP_INCONSISTENTE');
      }
      await this.idempotencia.concluir(
        {
          dados: { versaoAtribuicao, versaoEstado },
          operacaoId: concessao.operacaoId,
          tokenConcessao: concessao.tokenConcessao,
        },
        transacao,
      );
      await this.auditar(
        sessao,
        entrada,
        'ENCERRAR_ATENDIMENTO_ERP',
        'ATENDIMENTO_ERP_ENCERRADO',
        'CONFIRMADO',
        transacao,
        { versaoAtribuicao, versaoEstado },
      );
      if (
        !(await this.repositorio.liberarReservaEncerramento(
          entrada.atendimentoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_ENCERRAMENTO_ERP_INCONSISTENTE');
      }
    });
    return {
      confirmadoEm,
      operacaoId: concessao.operacaoId,
      situacao: 'CONCLUIDA',
      versaoAtribuicao,
      versaoEstado,
    };
  }

  private async registrarEfeitoAusente(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp | EntradaEncerramentoAtendimentoErp,
    concessao: ConcessaoOperacao,
    tipo: TipoAcaoAtendimentoErp,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      if (tipo === 'ENCERRAMENTO') {
        await this.repositorio.bloquearAtendimento(
          entrada.atendimentoId,
          transacao,
        );
        await this.exigirReserva(
          entrada.atendimentoId,
          concessao.operacaoId,
          transacao,
        );
      }
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
        tipo === 'COMENTARIO'
          ? 'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP'
          : 'ENCERRAR_ATENDIMENTO_ERP',
        `${tipo}_ATENDIMENTO_ERP_EFEITO_AUSENTE`,
        'EFEITO_AUSENTE',
        transacao,
      );
      if (
        tipo === 'ENCERRAMENTO' &&
        !(await this.repositorio.liberarReservaEncerramento(
          entrada.atendimentoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_ENCERRAMENTO_ERP_INCONSISTENTE');
      }
    });
  }

  private async marcarIncerto(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp | EntradaEncerramentoAtendimentoErp,
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
        'motivo' in entrada
          ? 'ENCERRAR_ATENDIMENTO_ERP'
          : 'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP',
        'ACAO_ATENDIMENTO_ERP_RESULTADO_INCERTO',
        'RESULTADO_INCERTO',
        transacao,
      );
    });
  }

  private async marcarFalhaTemporaria(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaComentarioAtendimentoErp | EntradaEncerramentoAtendimentoErp,
    concessao: ConcessaoOperacao,
    codigo: string,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      const encerramento = 'motivo' in entrada;
      if (encerramento) {
        await this.repositorio.bloquearAtendimento(
          entrada.atendimentoId,
          transacao,
        );
        await this.exigirReserva(
          entrada.atendimentoId,
          concessao.operacaoId,
          transacao,
        );
      }
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
        encerramento
          ? 'ENCERRAR_ATENDIMENTO_ERP'
          : 'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP',
        'ACAO_ATENDIMENTO_ERP_FALHA_TEMPORARIA',
        codigo,
        transacao,
      );
      if (
        encerramento &&
        !(await this.repositorio.liberarReservaEncerramento(
          entrada.atendimentoId,
          concessao.operacaoId,
          transacao,
        ))
      ) {
        throw new Error('RESERVA_ENCERRAMENTO_ERP_INCONSISTENTE');
      }
    });
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    entrada: ContextoAcaoAtendimentoErp,
    exigirAberto: boolean,
    transacao: TransacaoPrisma,
  ): Promise<ContextoAtendimentoErpPersistido> {
    let contexto: ContextoAtendimentoErpPersistido | undefined;
    await this.autorizacao.autorizar(
      {
        filaId: entrada.filaId,
        permissao: 'ENCERRAR_ATENDIMENTO',
        recurso: { id: entrada.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async (_autorizacao, transacaoAutorizada) => {
        contexto =
          transacaoAutorizada === undefined
            ? undefined
            : await this.repositorio.obterNoContexto(
                this.contexto(entrada),
                exigirAberto,
                transacaoAutorizada,
              );
        return {
          acessivel: contexto !== undefined,
          estadoPermiteAcao: contexto !== undefined,
        };
      },
      transacao,
    );
    if (contexto === undefined) throw new Error('ATENDIMENTO_ERP_INACESSIVEL');
    return contexto;
  }

  private async exigirReserva(
    atendimentoId: string,
    operacaoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (
      !(await this.repositorio.reservaEncerramentoPertence(
        atendimentoId,
        operacaoId,
        transacao,
      ))
    ) {
      throw new Error('RESERVA_ENCERRAMENTO_ERP_INCONSISTENTE');
    }
  }

  private async resultadoExistente(
    preparada: ResultadoIdempotencia,
    tipo: TipoAcaoAtendimentoErp,
    reconciliacao: boolean,
  ): Promise<ResultadoAcaoAtendimentoErp | undefined> {
    if (preparada.operacao.estado === 'CONCLUIDA') {
      const registro = await this.prisma.executarLeituraConsistente(
        (transacao) =>
          this.repositorio.obterPorOperacao(
            preparada.operacao.id,
            transacao,
          ),
      );
      if (registro === undefined || registro.tipo !== tipo) {
        throw new Error('REGISTRO_ACAO_ATENDIMENTO_ERP_INCONSISTENTE');
      }
      return {
        confirmadoEm: registro.confirmadoEm,
        operacaoId: preparada.operacao.id,
        situacao: 'CONCLUIDA',
        ...(registro.versaoAtribuicaoResultante === undefined
          ? {}
          : {
              versaoAtribuicao: registro.versaoAtribuicaoResultante,
            }),
        ...(registro.versaoEstadoResultante === undefined
          ? {}
          : { versaoEstado: registro.versaoEstadoResultante }),
      };
    }
    return this.resultadoEstadoNaoConcluido(preparada, reconciliacao);
  }

  private resultadoEstadoNaoConcluido(
    preparada: ResultadoIdempotencia,
    reconciliacao: boolean,
  ): ResultadoAcaoAtendimentoErp | undefined {
    const { estado, id, proximaAcaoEm } = preparada.operacao;
    if (estado === 'FALHA_DEFINITIVA') {
      return { operacaoId: id, situacao: 'FALHA_DEFINITIVA' };
    }
    if (estado === 'EM_EXECUCAO' || estado === 'EM_RECONCILIACAO') {
      return this.resultadoProcessando(id);
    }
    if (estado === 'RESULTADO_INCERTO') {
      if (
        !reconciliacao ||
        (proximaAcaoEm !== undefined && proximaAcaoEm > new Date())
      ) {
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

  private async auditar(
    sessao: ContextoSessaoAutorizacao,
    entrada: ContextoAcaoAtendimentoErp,
    acao: 'ADICIONAR_COMENTARIO_ATENDIMENTO_ERP' | 'ENCERRAR_ATENDIMENTO_ERP',
    tipoEvento: string,
    resultado: string,
    transacao: TransacaoPrisma,
    versoes?: { readonly versaoAtribuicao: number; readonly versaoEstado: number },
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao,
        atendimentoId: entrada.atendimentoId,
        dadosNovos: { resultado, ...(versoes ?? {}) },
        entidadeId: entrada.atendimentoId,
        entidadeTipo: 'ATENDIMENTO',
        filaId: entrada.filaId,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento,
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
  }

  private validarComentario(entrada: EntradaComentarioAtendimentoErp): void {
    this.validarBase(entrada);
    if (!this.textoValido(entrada.comentario, 4_000)) {
      throw new ErroEntradaAcaoAtendimentoErpInvalida();
    }
  }

  private validarEncerramento(
    entrada: EntradaEncerramentoAtendimentoErp,
  ): void {
    this.validarBase(entrada);
    if (
      !this.textoValido(entrada.motivo, 500) ||
      !Number.isInteger(entrada.versaoEstadoEsperada) ||
      entrada.versaoEstadoEsperada < 1 ||
      !Number.isInteger(entrada.versaoAtribuicaoEsperada) ||
      entrada.versaoAtribuicaoEsperada < 1
    ) {
      throw new ErroEntradaAcaoAtendimentoErpInvalida();
    }
  }

  private validarBase(
    entrada: EntradaComentarioAtendimentoErp | EntradaEncerramentoAtendimentoErp,
  ): void {
    if (
      entrada.confirmacaoExplicita !== true ||
      !UUID.test(entrada.atendimentoId) ||
      !UUID.test(entrada.filaId) ||
      !CHAVE_IDEMPOTENCIA.test(entrada.chaveIdempotencia) ||
      !this.textoValido(entrada.protocoloOficial, 256) ||
      Number.isNaN(entrada.proximaAcaoEm.getTime()) ||
      (entrada.duracaoConcessaoMs !== undefined &&
        (!Number.isInteger(entrada.duracaoConcessaoMs) ||
          entrada.duracaoConcessaoMs < 5_000 ||
          entrada.duracaoConcessaoMs > 300_000))
    ) {
      throw new ErroEntradaAcaoAtendimentoErpInvalida();
    }
  }

  private resultadoAcaoValido(
    resultado: unknown,
  ): resultado is ResultadoAdaptadorAcaoAtendimentoErp {
    if (!this.objetoComChaves(resultado)) return false;
    if (resultado.resultado === 'CONFIRMADO') {
      return this.chavesExatas(resultado, ['resultado']);
    }
    if (resultado.resultado === 'INDISPONIVEL') {
      return (
        this.chavesExatas(resultado, [
          'codigo',
          'efeitoExternoPossivel',
          'resultado',
        ]) &&
        ['CAPACIDADE_NAO_HABILITADA', 'ERP_INDISPONIVEL'].includes(
          String(resultado.codigo),
        ) &&
        resultado.efeitoExternoPossivel === false
      );
    }
    return (
      resultado.resultado === 'RESULTADO_INCERTO' &&
      this.chavesExatas(resultado, [
        'codigo',
        'requerReconciliacao',
        'resultado',
      ]) &&
      resultado.codigo === 'RESPOSTA_PERDIDA' &&
      resultado.requerReconciliacao === true
    );
  }

  private resultadoReconciliacaoValido(
    resultado: unknown,
  ): resultado is ResultadoReconciliacaoAcaoAtendimentoErp {
    if (!this.objetoComChaves(resultado)) return false;
    if (
      resultado.resultado === 'CONFIRMADO' ||
      resultado.resultado === 'EFEITO_AUSENTE'
    ) {
      return this.chavesExatas(resultado, ['resultado']);
    }
    return (
      resultado.resultado === 'INDISPONIVEL' &&
      this.chavesExatas(resultado, ['codigo', 'resultado']) &&
      ['CAPACIDADE_NAO_HABILITADA', 'ERP_INDISPONIVEL'].includes(
        String(resultado.codigo),
      )
    );
  }

  private objetoComChaves(valor: unknown): valor is Record<string, unknown> {
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  }

  private chavesExatas(
    valor: Readonly<Record<string, unknown>>,
    esperadas: readonly string[],
  ): boolean {
    const atuais = Object.keys(valor).sort();
    const previstas = [...esperadas].sort();
    return (
      atuais.length === previstas.length &&
      atuais.every((chave, indice) => chave === previstas[indice])
    );
  }

  private contexto(entrada: ContextoAcaoAtendimentoErp): ContextoAcaoAtendimentoErp {
    return {
      atendimentoId: entrada.atendimentoId,
      filaId: entrada.filaId,
      protocoloOficial: entrada.protocoloOficial.trim(),
    };
  }

  private textoValido(valor: string, limite: number): boolean {
    return valor.trim().length > 0 && valor.length <= limite;
  }

  private assinar(valor: unknown): string {
    return this.hash(JSON.stringify(valor));
  }

  private hash(valor: string): string {
    return createHash('sha256').update(valor, 'utf8').digest('hex');
  }

  private resultadoAguardando(operacaoId: string): ResultadoAcaoAtendimentoErp {
    return { operacaoId, situacao: 'AGUARDANDO_NOVA_TENTATIVA' };
  }

  private resultadoIncerto(operacaoId: string): ResultadoAcaoAtendimentoErp {
    return { operacaoId, situacao: 'RECONCILIACAO_NECESSARIA' };
  }

  private resultadoProcessando(operacaoId: string): ResultadoAcaoAtendimentoErp {
    return { operacaoId, situacao: 'PROCESSAMENTO_EM_CURSO' };
  }
}
