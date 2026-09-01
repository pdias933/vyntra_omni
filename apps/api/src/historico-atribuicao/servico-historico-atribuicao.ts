import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAtendimentoHistoricoAtribuicaoAusente,
  ErroConflitoHistoricoAtribuicao,
  ErroHistoricoAtribuicaoInvalido,
} from './erros-historico-atribuicao.js';
import type {
  EntradaHistoricoAtribuicao,
  HistoricoAtribuicaoPersistido,
  TipoHistoricoAtribuicao,
} from './modelo-historico-atribuicao.js';
import {
  REPOSITORIO_HISTORICO_ATRIBUICAO,
  type RepositorioHistoricoAtribuicao,
} from './repositorio-historico-atribuicao.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIPOS: readonly TipoHistoricoAtribuicao[] = [
  'ENTRADA_FILA',
  'RESGATE',
  'TRANSFERENCIA_FILA',
  'TRANSFERENCIA_USUARIO',
  'ASSUNCAO_SUPERVISOR',
  'REABERTURA',
];

@Injectable()
export class ServicoHistoricoAtribuicao {
  public constructor(
    @Inject(REPOSITORIO_HISTORICO_ATRIBUICAO)
    private readonly repositorio: RepositorioHistoricoAtribuicao,
  ) {}

  public async inicializar(
    atendimentoId: string,
    entrada: EntradaHistoricoAtribuicao,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<HistoricoAtribuicaoPersistido> {
    this.validarEntrada(atendimentoId, entrada, ['ENTRADA_FILA', 'REABERTURA']);
    await this.repositorio.bloquearAtendimento(atendimentoId, transacao);
    const atribuicao = await this.repositorio.obterAtribuicaoAtendimento(
      atendimentoId,
      transacao,
    );
    if (atribuicao === undefined) {
      throw new ErroAtendimentoHistoricoAtribuicaoAusente();
    }
    this.validarCorrespondencia(atribuicao, entrada);
    const existente = await this.repositorio.obterAberto(atendimentoId, transacao);
    if (existente !== undefined) throw new ErroConflitoHistoricoAtribuicao();
    const historico = this.criarHistorico(atendimentoId, entrada, relogio());
    if (!(await this.repositorio.criar(historico, transacao))) {
      throw new ErroConflitoHistoricoAtribuicao();
    }
    return historico;
  }

  public async substituir(
    atendimentoId: string,
    entrada: EntradaHistoricoAtribuicao,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<HistoricoAtribuicaoPersistido> {
    this.validarEntrada(atendimentoId, entrada, [
      'RESGATE',
      'TRANSFERENCIA_FILA',
      'TRANSFERENCIA_USUARIO',
      'ASSUNCAO_SUPERVISOR',
      'REABERTURA',
    ]);
    await this.repositorio.bloquearAtendimento(atendimentoId, transacao);
    const [atribuicao, aberto] = await Promise.all([
      this.repositorio.obterAtribuicaoAtendimento(atendimentoId, transacao),
      this.repositorio.obterAberto(atendimentoId, transacao),
    ]);
    if (atribuicao === undefined) {
      throw new ErroAtendimentoHistoricoAtribuicaoAusente();
    }
    if (aberto === undefined) throw new ErroConflitoHistoricoAtribuicao();
    this.validarCorrespondencia(atribuicao, entrada);
    const agora = relogio();
    if (Number.isNaN(agora.getTime()) || agora < aberto.iniciadoEm) {
      throw new ErroHistoricoAtribuicaoInvalido();
    }
    if (!(await this.repositorio.finalizar(aberto.id, agora, transacao))) {
      throw new ErroConflitoHistoricoAtribuicao();
    }
    const proximo = this.criarHistorico(atendimentoId, entrada, agora);
    if (!(await this.repositorio.criar(proximo, transacao))) {
      throw new ErroConflitoHistoricoAtribuicao();
    }
    return proximo;
  }

  private criarHistorico(
    atendimentoId: string,
    entrada: EntradaHistoricoAtribuicao,
    iniciadoEm: Date,
  ): HistoricoAtribuicaoPersistido {
    if (Number.isNaN(iniciadoEm.getTime())) {
      throw new ErroHistoricoAtribuicaoInvalido();
    }
    return {
      atendimentoId,
      filaId: entrada.filaId,
      id: randomUUID(),
      iniciadoEm,
      tipo: entrada.tipo,
      ...(entrada.usuarioResponsavelId === undefined
        ? {}
        : { usuarioResponsavelId: entrada.usuarioResponsavelId }),
      ...(entrada.executadoPorUsuarioId === undefined
        ? {}
        : { executadoPorUsuarioId: entrada.executadoPorUsuarioId }),
    };
  }

  private validarEntrada(
    atendimentoId: string,
    entrada: EntradaHistoricoAtribuicao,
    tiposPermitidos: readonly TipoHistoricoAtribuicao[],
  ): void {
    const ids = [
      atendimentoId,
      entrada.filaId,
      entrada.usuarioResponsavelId,
      entrada.executadoPorUsuarioId,
    ].filter((id): id is string => id !== undefined);
    const exigeResponsavel = [
      'RESGATE',
      'TRANSFERENCIA_USUARIO',
      'ASSUNCAO_SUPERVISOR',
    ].includes(entrada.tipo);
    const proibeResponsavel = [
      'ENTRADA_FILA',
      'TRANSFERENCIA_FILA',
    ].includes(entrada.tipo);
    if (
      ids.some((id) => !UUID.test(id)) ||
      !TIPOS.includes(entrada.tipo) ||
      !tiposPermitidos.includes(entrada.tipo) ||
      (exigeResponsavel && entrada.usuarioResponsavelId === undefined) ||
      (proibeResponsavel && entrada.usuarioResponsavelId !== undefined)
    ) {
      throw new ErroHistoricoAtribuicaoInvalido();
    }
  }

  private validarCorrespondencia(
    atribuicao: {
      readonly filaId?: string | undefined;
      readonly usuarioResponsavelId?: string | undefined;
    },
    entrada: EntradaHistoricoAtribuicao,
  ): void {
    if (
      atribuicao.filaId !== entrada.filaId ||
      atribuicao.usuarioResponsavelId !== entrada.usuarioResponsavelId
    ) {
      throw new ErroConflitoHistoricoAtribuicao();
    }
  }
}
