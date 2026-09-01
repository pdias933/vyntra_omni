import {
  ErroInvarianteAtendimento,
  ErroTransicaoAtendimentoInvalida,
} from './erros-atendimento.js';
import type {
  AtendimentoPersistido,
  ComandoTransicaoAtendimento,
} from './modelo-atendimento.js';

const TRINTA_MINUTOS_MS = 30 * 60 * 1_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class MaquinaEstadoAtendimento {
  public transitar(
    atual: AtendimentoPersistido,
    comando: ComandoTransicaoAtendimento,
    agora: Date,
  ): AtendimentoPersistido {
    this.validar(atual);
    if (Number.isNaN(agora.getTime()) || agora < atual.atualizadoEm) {
      throw new ErroTransicaoAtendimentoInvalida();
    }

    const proximo = this.aplicar(atual, comando, agora);
    this.validar(proximo);
    return proximo;
  }

  public validar(atendimento: AtendimentoPersistido): void {
    const identificadores = [
      atendimento.id,
      atendimento.conversaId,
      atendimento.contaWhatsAppOrigemId,
    ];
    if (
      identificadores.some((id) => !UUID.test(id)) ||
      atendimento.versaoEstado < 1 ||
      atendimento.versaoAtribuicao < 1 ||
      Number.isNaN(atendimento.iniciadoEm.getTime()) ||
      Number.isNaN(atendimento.atualizadoEm.getTime()) ||
      atendimento.atualizadoEm < atendimento.iniciadoEm
    ) {
      throw new ErroInvarianteAtendimento();
    }

    const estaAberto =
      atendimento.estado === 'AGUARDANDO' ||
      atendimento.estado === 'EM_ATENDIMENTO';
    const encerramento = [
      atendimento.encerradoEm,
      atendimento.encerradoPorTipo,
      atendimento.encerradoPorId,
      atendimento.motivoEncerramento,
      atendimento.podeReabrirAte,
    ];
    if (estaAberto && encerramento.some((valor) => valor !== undefined)) {
      throw new ErroInvarianteAtendimento();
    }
    if (estaAberto && atendimento.finalizadoDefinitivamenteEm !== undefined) {
      throw new ErroInvarianteAtendimento();
    }

    if (atendimento.estado === 'AGUARDANDO') {
      this.validarAguardando(atendimento);
    } else if (atendimento.estado === 'EM_ATENDIMENTO') {
      if (
        atendimento.modo !== 'HUMANO' ||
        atendimento.filaAtualId === undefined ||
        atendimento.usuarioResponsavelId === undefined ||
        !['NENHUM', 'AGUARDANDO_CLIENTE'].includes(atendimento.motivoEspera)
      ) {
        throw new ErroInvarianteAtendimento();
      }
    } else {
      this.validarEncerrado(atendimento);
    }
  }

  private aplicar(
    atual: AtendimentoPersistido,
    comando: ComandoTransicaoAtendimento,
    agora: Date,
  ): AtendimentoPersistido {
    switch (comando.tipo) {
      case 'ENCAMINHAR_FILA':
        this.exigir(atual.estado === 'AGUARDANDO', comando.filaId);
        return this.atualizar(atual, agora, {
          filaAtualId: comando.filaId,
          modo: 'FILA_HUMANA',
          motivoEspera: comando.motivo ?? 'AGUARDANDO_HUMANO',
          usuarioResponsavelId: undefined,
        });
      case 'ATRIBUIR_HUMANO':
        this.exigir(atual.estado === 'AGUARDANDO', comando.filaId, comando.usuarioId);
        return this.atualizarAtribuicao(atual, agora, {
          estado: 'EM_ATENDIMENTO',
          filaAtualId: comando.filaId,
          modo: 'HUMANO',
          motivoEspera: 'NENHUM',
          usuarioResponsavelId: comando.usuarioId,
        });
      case 'RETORNAR_FILA':
        this.exigir(atual.estado === 'EM_ATENDIMENTO', comando.filaId);
        return this.atualizarAtribuicao(atual, agora, {
          estado: 'AGUARDANDO',
          filaAtualId: comando.filaId,
          modo: 'FILA_HUMANA',
          motivoEspera: 'AGUARDANDO_HUMANO',
          usuarioResponsavelId: undefined,
        });
      case 'TRANSFERIR_FILA':
        this.exigir(
          atual.estado === 'AGUARDANDO' || atual.estado === 'EM_ATENDIMENTO',
          comando.filaId,
        );
        return this.atualizarAtribuicao(atual, agora, {
          estado: 'AGUARDANDO',
          filaAtualId: comando.filaId,
          modo: 'FILA_HUMANA',
          motivoEspera: 'AGUARDANDO_HUMANO',
          usuarioResponsavelId: undefined,
        });
      case 'TRANSFERIR_USUARIO':
        this.exigir(
          atual.estado === 'AGUARDANDO' || atual.estado === 'EM_ATENDIMENTO',
          comando.filaId,
          comando.usuarioId,
        );
        return this.atualizarAtribuicao(atual, agora, {
          estado: 'EM_ATENDIMENTO',
          filaAtualId: comando.filaId,
          modo: 'HUMANO',
          motivoEspera: 'NENHUM',
          usuarioResponsavelId: comando.usuarioId,
        });
      case 'ASSUMIR_SUPERVISOR':
        this.exigir(
          atual.estado === 'AGUARDANDO' || atual.estado === 'EM_ATENDIMENTO',
          comando.filaId,
          comando.usuarioId,
        );
        return this.atualizarAtribuicao(atual, agora, {
          estado: 'EM_ATENDIMENTO',
          filaAtualId: comando.filaId,
          modo: 'HUMANO',
          motivoEspera: 'NENHUM',
          usuarioResponsavelId: comando.usuarioId,
        });
      case 'ALTERAR_MOTIVO_ESPERA':
        this.exigir(
          atual.estado === 'AGUARDANDO' || atual.estado === 'EM_ATENDIMENTO',
        );
        return this.atualizar(atual, agora, { motivoEspera: comando.motivo });
      case 'ENCERRAR':
        return this.encerrar(atual, comando, agora);
      case 'REABRIR_USUARIO':
        this.exigirReabertura(atual, agora, comando.janelaCanalAberta);
        this.exigir(true, comando.filaId, comando.usuarioId);
        return this.limparEncerramento(atual, agora, {
          estado: 'EM_ATENDIMENTO',
          filaAtualId: comando.filaId,
          modo: 'HUMANO',
          motivoEspera: 'NENHUM',
          usuarioResponsavelId: comando.usuarioId,
        });
      case 'REABRIR_ENTRADA': {
        this.exigirReabertura(atual, agora, comando.janelaCanalAberta);
        this.exigir(
          atual.encerradoPorTipo === 'FLUXO',
          atual.filaFallbackReaberturaId,
        );
        const filaId = atual.filaFallbackReaberturaId;
        if (filaId === undefined) throw new ErroTransicaoAtendimentoInvalida();
        return this.limparEncerramento(atual, agora, {
          estado: 'AGUARDANDO',
          filaAtualId: filaId,
          modo: 'FILA_HUMANA',
          motivoEspera: 'AGUARDANDO_HUMANO',
          usuarioResponsavelId: undefined,
        });
      }
      case 'FINALIZAR_TOLERANCIA':
        this.exigir(
          atual.estado === 'ENCERRADO_REABRIVEL' &&
            atual.podeReabrirAte !== undefined &&
            agora >= atual.podeReabrirAte,
        );
        return this.atualizar(atual, agora, {
          estado: 'ENCERRADO',
          finalizadoDefinitivamenteEm: agora,
        });
    }
  }

  private encerrar(
    atual: AtendimentoPersistido,
    comando: Extract<ComandoTransicaoAtendimento, { readonly tipo: 'ENCERRAR' }>,
    agora: Date,
  ): AtendimentoPersistido {
    this.exigir(
      atual.estado === 'AGUARDANDO' || atual.estado === 'EM_ATENDIMENTO',
      comando.atorId,
    );
    const motivo = comando.motivo.trim();
    this.exigir(
      motivo.length >= 1 &&
        motivo.length <= 500 &&
        ((comando.origem === 'FLUXO') ===
          (comando.filaFallbackReaberturaId !== undefined)),
    );
    if (
      comando.filaFallbackReaberturaId !== undefined &&
      !UUID.test(comando.filaFallbackReaberturaId)
    ) {
      throw new ErroTransicaoAtendimentoInvalida();
    }
    const base = {
      encerradoEm: agora,
      encerradoPorId: comando.atorId,
      encerradoPorTipo: comando.origem,
      estado: 'ENCERRADO_REABRIVEL' as const,
      filaFallbackReaberturaId: comando.filaFallbackReaberturaId,
      finalizadoDefinitivamenteEm: undefined,
      motivoEncerramento: motivo,
      podeReabrirAte: new Date(agora.getTime() + TRINTA_MINUTOS_MS),
      usuarioResponsavelId: undefined,
    };
    return atual.usuarioResponsavelId === undefined
      ? this.atualizar(atual, agora, base)
      : this.atualizarAtribuicao(atual, agora, base);
  }

  private exigirReabertura(
    atual: AtendimentoPersistido,
    agora: Date,
    janelaCanalAberta: boolean,
  ): void {
    this.exigir(
      atual.estado === 'ENCERRADO_REABRIVEL' &&
        janelaCanalAberta &&
        atual.podeReabrirAte !== undefined &&
        agora <= atual.podeReabrirAte,
    );
  }

  private limparEncerramento(
    atual: AtendimentoPersistido,
    agora: Date,
    campos: Partial<AtendimentoPersistido>,
  ): AtendimentoPersistido {
    return this.atualizarAtribuicao(atual, agora, {
      ...campos,
      encerradoEm: undefined,
      encerradoPorId: undefined,
      encerradoPorTipo: undefined,
      filaFallbackReaberturaId: undefined,
      finalizadoDefinitivamenteEm: undefined,
      motivoEncerramento: undefined,
      podeReabrirAte: undefined,
    });
  }

  private atualizar(
    atual: AtendimentoPersistido,
    agora: Date,
    campos: Partial<AtendimentoPersistido>,
  ): AtendimentoPersistido {
    return {
      ...atual,
      ...campos,
      atualizadoEm: agora,
      versaoEstado: atual.versaoEstado + 1,
    };
  }

  private atualizarAtribuicao(
    atual: AtendimentoPersistido,
    agora: Date,
    campos: Partial<AtendimentoPersistido>,
  ): AtendimentoPersistido {
    return {
      ...this.atualizar(atual, agora, campos),
      versaoAtribuicao: atual.versaoAtribuicao + 1,
    };
  }

  private validarAguardando(atendimento: AtendimentoPersistido): void {
    const botValido =
      atendimento.modo === 'BOT' &&
      atendimento.filaAtualId === undefined &&
      atendimento.usuarioResponsavelId === undefined &&
      ['PROCESSANDO_BOT', 'FORA_DO_HORARIO', 'AGUARDANDO_CLIENTE'].includes(
        atendimento.motivoEspera,
      );
    const filaValida =
      atendimento.modo === 'FILA_HUMANA' &&
      atendimento.filaAtualId !== undefined &&
      atendimento.usuarioResponsavelId === undefined &&
      ['AGUARDANDO_HUMANO', 'FORA_DO_HORARIO'].includes(
        atendimento.motivoEspera,
      );
    if (!botValido && !filaValida) throw new ErroInvarianteAtendimento();
  }

  private validarEncerrado(atendimento: AtendimentoPersistido): void {
    const encerramentoCompleto =
      atendimento.encerradoEm !== undefined &&
      atendimento.encerradoPorTipo !== undefined &&
      atendimento.encerradoPorId !== undefined &&
      UUID.test(atendimento.encerradoPorId) &&
      atendimento.motivoEncerramento !== undefined &&
      atendimento.motivoEncerramento.trim().length >= 1 &&
      atendimento.podeReabrirAte?.getTime() ===
        atendimento.encerradoEm.getTime() + TRINTA_MINUTOS_MS &&
      atendimento.usuarioResponsavelId === undefined &&
      ((atendimento.encerradoPorTipo === 'FLUXO') ===
        (atendimento.filaFallbackReaberturaId !== undefined));
    const finalizacaoValida =
      atendimento.estado === 'ENCERRADO_REABRIVEL'
        ? atendimento.finalizadoDefinitivamenteEm === undefined
        : atendimento.finalizadoDefinitivamenteEm !== undefined &&
          atendimento.finalizadoDefinitivamenteEm >= atendimento.podeReabrirAte!;
    if (!encerramentoCompleto || !finalizacaoValida) {
      throw new ErroInvarianteAtendimento();
    }
  }

  private exigir(condicao: boolean, ...identificadores: (string | undefined)[]): void {
    if (!condicao || identificadores.some((id) => id === undefined || !UUID.test(id))) {
      throw new ErroTransicaoAtendimentoInvalida();
    }
  }
}
