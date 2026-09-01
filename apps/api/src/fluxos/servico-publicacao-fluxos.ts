import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type {
  CodigoPermissaoAutorizacao,
  ContextoSessaoAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroConflitoVersaoFluxo,
  ErroFluxoIndisponivel,
  ErroFluxoInvalido,
  ErroTransicaoPublicacaoFluxoInvalida,
  ErroVersaoFluxoIndisponivel,
  ErroVersaoFluxoNaoPublicavel,
} from './erros-fluxo.js';
import type {
  EntradaArquivamentoFluxo,
  EntradaPublicacaoFluxo,
  EntradaReversaoFluxo,
  FluxoPersistido,
  HistoricoPublicacaoFluxoPersistido,
  ResultadoMudancaPublicacaoFluxo,
  TipoMudancaPublicacaoFluxo,
  VersaoFluxoPersistida,
} from './modelo-fluxo.js';
import {
  REPOSITORIO_FLUXOS,
  type RepositorioFluxos,
} from './repositorio-fluxos.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoPublicacaoFluxos {
  public constructor(
    @Inject(REPOSITORIO_FLUXOS)
    private readonly repositorio: RepositorioFluxos,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async publicar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaPublicacaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    const fluxoId = this.validarId(entrada.fluxoId);
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoFluxoEsperada);
    await this.autorizar(sessao, 'PUBLICAR_FLUXO', fluxoId, transacao);
    await this.repositorio.bloquearFluxo(fluxoId, transacao);
    const fluxo = await this.obterFluxoAtivo(fluxoId, revisaoEsperada, transacao);
    const alvo = await this.obterVersaoDoFluxo(
      versaoFluxoId,
      fluxoId,
      transacao,
    );
    if (alvo.estado !== 'EM_TESTE') {
      throw new ErroVersaoFluxoNaoPublicavel();
    }
    const anterior = await this.obterVersaoAnterior(fluxo, transacao);
    const agora = this.obterAgora(relogio);
    if (anterior !== undefined) {
      await this.confirmar(
        this.repositorio.arquivarVersao(
          anterior.id,
          fluxoId,
          agora,
          transacao,
        ),
      );
    }
    await this.confirmar(
      this.repositorio.publicarVersao(
        alvo.id,
        fluxoId,
        sessao.usuarioId,
        agora,
        transacao,
      ),
    );
    return this.concluirMudanca(
      sessao,
      fluxo,
      alvo.id,
      anterior?.id,
      'PUBLICACAO',
      agora,
      transacao,
    );
  }

  public async arquivarPublicacaoAtual(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaArquivamentoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    const fluxoId = this.validarId(entrada.fluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoFluxoEsperada);
    await this.autorizar(sessao, 'PUBLICAR_FLUXO', fluxoId, transacao);
    await this.repositorio.bloquearFluxo(fluxoId, transacao);
    const fluxo = await this.obterFluxoAtivo(fluxoId, revisaoEsperada, transacao);
    const anterior = await this.obterVersaoAnterior(fluxo, transacao);
    if (anterior === undefined) {
      throw new ErroTransicaoPublicacaoFluxoInvalida();
    }
    const agora = this.obterAgora(relogio);
    await this.confirmar(
      this.repositorio.arquivarVersao(
        anterior.id,
        fluxoId,
        agora,
        transacao,
      ),
    );
    return this.concluirMudanca(
      sessao,
      fluxo,
      undefined,
      anterior.id,
      'ARQUIVAMENTO',
      agora,
      transacao,
    );
  }

  public async reverter(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaReversaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    const fluxoId = this.validarId(entrada.fluxoId);
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoFluxoEsperada);
    await this.autorizar(sessao, 'REVERTER_FLUXO', fluxoId, transacao);
    await this.repositorio.bloquearFluxo(fluxoId, transacao);
    const fluxo = await this.obterFluxoAtivo(fluxoId, revisaoEsperada, transacao);
    const alvo = await this.obterVersaoDoFluxo(
      versaoFluxoId,
      fluxoId,
      transacao,
    );
    if (alvo.estado !== 'ARQUIVADA' || alvo.id === fluxo.versaoPublicadaId) {
      throw new ErroTransicaoPublicacaoFluxoInvalida();
    }
    const anterior = await this.obterVersaoAnterior(fluxo, transacao);
    const agora = this.obterAgora(relogio);
    if (anterior !== undefined) {
      await this.confirmar(
        this.repositorio.arquivarVersao(
          anterior.id,
          fluxoId,
          agora,
          transacao,
        ),
      );
    }
    await this.confirmar(
      this.repositorio.reativarVersaoArquivada(
        alvo.id,
        fluxoId,
        agora,
        transacao,
      ),
    );
    return this.concluirMudanca(
      sessao,
      fluxo,
      alvo.id,
      anterior?.id,
      'REVERSAO',
      agora,
      transacao,
    );
  }

  private async concluirMudanca(
    sessao: ContextoSessaoAutorizacao,
    fluxo: FluxoPersistido,
    versaoNovaId: string | undefined,
    versaoAnteriorId: string | undefined,
    tipo: TipoMudancaPublicacaoFluxo,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    await this.confirmar(
      this.repositorio.alterarPonteiroPublicado(
        fluxo.id,
        fluxo.revisao,
        fluxo.versaoPublicadaId,
        versaoNovaId,
        agora,
        transacao,
      ),
    );
    const revisaoFluxo = fluxo.revisao + 1;
    const historico: HistoricoPublicacaoFluxoPersistido = {
      executadoEm: agora,
      executadoPorUsuarioId: sessao.usuarioId,
      fluxoId: fluxo.id,
      id: randomUUID(),
      revisaoFluxoResultante: revisaoFluxo,
      tipo,
      ...(versaoAnteriorId === undefined ? {} : { versaoAnteriorId }),
      ...(versaoNovaId === undefined ? {} : { versaoNovaId }),
    };
    await this.repositorio.registrarHistoricoPublicacao(historico, transacao);
    await this.auditoria.registrar(
      {
        acao: tipo,
        dadosNovos: {
          revisaoFluxo,
          tipo,
          ...(versaoAnteriorId === undefined ? {} : { versaoAnteriorId }),
          ...(versaoNovaId === undefined ? {} : { versaoNovaId }),
        },
        entidadeId: fluxo.id,
        entidadeTipo: 'FLUXO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: `FLUXO_${tipo}`,
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return {
      fluxoId: fluxo.id,
      revisaoFluxo,
      tipo,
      ...(versaoAnteriorId === undefined ? {} : { versaoAnteriorId }),
      ...(versaoNovaId === undefined
        ? {}
        : { versaoPublicadaId: versaoNovaId }),
    };
  }

  private async obterFluxoAtivo(
    fluxoId: string,
    revisaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<FluxoPersistido> {
    const fluxo = await this.repositorio.obterFluxo(fluxoId, transacao);
    if (fluxo?.ativo !== true) throw new ErroFluxoIndisponivel();
    if (fluxo.revisao !== revisaoEsperada) {
      throw new ErroConflitoVersaoFluxo();
    }
    return fluxo;
  }

  private async obterVersaoDoFluxo(
    versaoFluxoId: string,
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida> {
    const versao = await this.repositorio.obterVersao(
      versaoFluxoId,
      transacao,
    );
    if (versao === undefined) throw new ErroVersaoFluxoIndisponivel();
    if (versao.fluxoId !== fluxoId) {
      throw new ErroTransicaoPublicacaoFluxoInvalida();
    }
    return versao;
  }

  private async obterVersaoAnterior(
    fluxo: FluxoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida | undefined> {
    if (fluxo.versaoPublicadaId === undefined) return undefined;
    const anterior = await this.obterVersaoDoFluxo(
      fluxo.versaoPublicadaId,
      fluxo.id,
      transacao,
    );
    if (anterior.estado !== 'PUBLICADA') {
      throw new ErroTransicaoPublicacaoFluxoInvalida();
    }
    return anterior;
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    permissao: Extract<
      CodigoPermissaoAutorizacao,
      'PUBLICAR_FLUXO' | 'REVERTER_FLUXO'
    >,
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao,
        recurso: { id: fluxoId, tipo: 'FLUXO' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private async confirmar(resultado: Promise<boolean>): Promise<void> {
    if (!(await resultado)) throw new ErroConflitoVersaoFluxo();
  }

  private validarId(valor: unknown): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private validarRevisao(valor: unknown): number {
    if (!Number.isInteger(valor) || typeof valor !== 'number' || valor < 1) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private obterAgora(relogio: () => Date): Date {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroFluxoInvalido();
    return agora;
  }
}
