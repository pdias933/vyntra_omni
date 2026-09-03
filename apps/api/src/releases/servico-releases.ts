import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { PlataformaMobile } from '../autenticacao/modelo-autenticacao-mobile.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAtualizacaoObrigatoria,
  ErroConfiguracaoReleaseInvalida,
  ErroConflitoVersaoRelease,
} from './erros-releases.js';
import type {
  AvaliacaoPoliticaVersaoMobile,
  ConfiguracaoClienteMobile,
  ControleRecursoPersistido,
  EntradaAtualizacaoControleRecurso,
  EntradaAtualizacaoPoliticaVersaoMobile,
  PoliticaVersaoMobilePersistida,
} from './modelo-releases.js';
import {
  REPOSITORIO_RELEASES,
  type RepositorioReleases,
} from './repositorio-releases.js';

const CODIGO_CONTROLE = /^[A-Z][A-Z0-9_]{2,99}$/u;
const VERSAO_SEMANTICA = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u;
const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECURSO_ADMINISTRACAO_RELEASES =
  '11111111-1111-4111-8111-111111111118';
const ENTIDADES_POLITICA: Readonly<Record<PlataformaMobile, string>> = {
  ANDROID: '11111111-1111-4111-8111-111111111181',
  IOS: '11111111-1111-4111-8111-111111111182',
};

@Injectable()
export class ServicoReleases {
  public constructor(
    @Inject(REPOSITORIO_RELEASES)
    private readonly repositorio: RepositorioReleases,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async avaliarPoliticaVersao(
    plataforma: PlataformaMobile,
    versaoInformada: string,
  ): Promise<AvaliacaoPoliticaVersaoMobile> {
    this.validarPlataforma(plataforma);
    const versao = this.lerVersao(versaoInformada);
    const politica = await this.repositorio.obterPolitica(plataforma);
    if (politica === undefined) throw new Error('POLITICA_VERSAO_AUSENTE');
    return this.avaliarPolitica(politica, versaoInformada, versao);
  }

  public async exigirVersaoPermitida(
    plataforma: PlataformaMobile,
    versaoInformada: string,
  ): Promise<void> {
    const avaliacao = await this.avaliarPoliticaVersao(
      plataforma,
      versaoInformada,
    );
    if (avaliacao.atualizacaoObrigatoria) {
      throw new ErroAtualizacaoObrigatoria();
    }
  }

  public async obterConfiguracaoMobile(
    usuarioId: string | undefined,
    plataforma: PlataformaMobile,
    versaoInformada: string,
  ): Promise<ConfiguracaoClienteMobile> {
    const politica = await this.avaliarPoliticaVersao(
      plataforma,
      versaoInformada,
    );
    if (usuarioId === undefined) {
      return { controlesRecurso: {}, politica };
    }
    const controlesRecurso = await this.obterControlesUsuario(usuarioId);
    return { controlesRecurso, politica };
  }

  public async obterControlesUsuario(
    usuarioId: string,
    filaId?: string,
    transacao?: TransacaoPrisma,
  ): Promise<Readonly<Record<string, boolean>>> {
    this.validarUuid(usuarioId);
    if (filaId !== undefined) this.validarUuid(filaId);
    const contexto =
      await this.repositorio.obterContextoControlesUsuario(
        usuarioId,
        transacao,
      );
    const controlesRecurso: Record<string, boolean> = {};
    for (const controle of contexto?.controles ?? []) {
      controlesRecurso[controle.codigo] =
        contexto !== undefined &&
        contexto.usuarioAtivo &&
        contexto.perfilAtivo &&
        controle.estado === 'ATIVADO' &&
        !controle.desligadoEmergencialmente &&
        ((controle.liberarAdministradores &&
          contexto.papelBase === 'ADMINISTRADOR') ||
          controle.usuarioAlvo ||
          (filaId === undefined
            ? controle.filaAlvo
            : controle.filasAlvo.includes(filaId)) ||
          this.estaNoPercentual(
            controle.codigo,
            usuarioId,
            controle.percentualLiberacao,
          ));
    }
    return controlesRecurso;
  }

  public async listarAdministracao(
    sessao: ContextoSessaoAutorizacao,
  ): Promise<{
    readonly controles: readonly ControleRecursoPersistido[];
    readonly politicas: readonly PoliticaVersaoMobilePersistida[];
  }> {
    await this.autorizar(sessao);
    const [controles, politicas] = await Promise.all([
      this.repositorio.listarControles(),
      this.repositorio.listarPoliticas(),
    ]);
    return { controles, politicas };
  }

  public async atualizarControle(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoControleRecurso,
    transacao: TransacaoPrisma,
  ): Promise<ControleRecursoPersistido> {
    this.validarControle(entrada);
    await this.autorizar(sessao, transacao);
    await this.repositorio.serializarControle(entrada.codigo, transacao);
    const anterior = await this.repositorio.obterControle(
      entrada.codigo,
      transacao,
    );
    if ((anterior?.versao ?? 0) !== entrada.versaoEsperada) {
      throw new ErroConflitoVersaoRelease();
    }
    if (
      !(await this.repositorio.alvosAtivosExistem(
        entrada.usuariosAlvo,
        entrada.filasAlvo,
        transacao,
      ))
    ) {
      throw new ErroConfiguracaoReleaseInvalida();
    }

    const id = anterior?.id ?? randomUUID();
    if (anterior === undefined) {
      await this.repositorio.criarControle({ ...entrada, id }, transacao);
    } else {
      const atualizado = await this.repositorio.atualizarControle(
        { ...entrada, id },
        transacao,
      );
      if (!atualizado) throw new ErroConflitoVersaoRelease();
    }
    const atual: ControleRecursoPersistido = {
      codigo: entrada.codigo,
      desligadoEmergencialmente: entrada.desligadoEmergencialmente,
      estado: entrada.estado,
      filasAlvo: [...entrada.filasAlvo],
      id,
      liberarAdministradores: entrada.liberarAdministradores,
      percentualLiberacao: entrada.percentualLiberacao,
      usuariosAlvo: [...entrada.usuariosAlvo],
      versao: entrada.versaoEsperada + 1,
    };
    await this.auditoria.registrar(
      {
        acao: 'ATUALIZAR_CONTROLE_RECURSO',
        ...(anterior === undefined
          ? {}
          : { dadosAnteriores: { ...anterior } }),
        dadosNovos: { ...atual },
        entidadeId: id,
        entidadeTipo: 'CONTROLE_RECURSO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: entrada.desligadoEmergencialmente
          ? 'CONTROLE_RECURSO_DESLIGADO_EMERGENCIALMENTE'
          : 'CONTROLE_RECURSO_ATUALIZADO',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return atual;
  }

  public async atualizarPolitica(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAtualizacaoPoliticaVersaoMobile,
    transacao: TransacaoPrisma,
  ): Promise<PoliticaVersaoMobilePersistida> {
    const minima = this.lerVersao(entrada.versaoMinima);
    const recomendada = this.lerVersao(entrada.versaoRecomendada);
    this.validarPolitica(entrada, minima, recomendada);
    await this.autorizar(sessao, transacao);
    await this.repositorio.serializarPolitica(entrada.plataforma, transacao);
    const anterior = await this.repositorio.obterPolitica(
      entrada.plataforma,
      transacao,
    );
    if (
      anterior === undefined ||
      anterior.versao !== entrada.versaoEsperada
    ) {
      throw new ErroConflitoVersaoRelease();
    }
    const atualizado = await this.repositorio.atualizarPolitica(
      entrada,
      transacao,
    );
    if (!atualizado) throw new ErroConflitoVersaoRelease();
    const atual: PoliticaVersaoMobilePersistida = {
      plataforma: entrada.plataforma,
      versao: entrada.versaoEsperada + 1,
      versaoMinima: entrada.versaoMinima,
      versaoRecomendada: entrada.versaoRecomendada,
      ...(entrada.mensagem === undefined ? {} : { mensagem: entrada.mensagem }),
      ...(entrada.urlLoja === undefined ? {} : { urlLoja: entrada.urlLoja }),
    };
    await this.auditoria.registrar(
      {
        acao: 'ATUALIZAR_POLITICA_VERSAO_MOBILE',
        dadosAnteriores: { ...anterior },
        dadosNovos: { ...atual },
        entidadeId: ENTIDADES_POLITICA[entrada.plataforma],
        entidadeTipo: 'POLITICA_VERSAO_MOBILE',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'POLITICA_VERSAO_MOBILE_ATUALIZADA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return atual;
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    transacao?: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_RELEASES',
        recurso: {
          id: RECURSO_ADMINISTRACAO_RELEASES,
          tipo: 'ADMINISTRACAO_RELEASES',
        },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private avaliarPolitica(
    politica: PoliticaVersaoMobilePersistida,
    versaoInformada: string,
    versao: readonly [number, number, number],
  ): AvaliacaoPoliticaVersaoMobile {
    const minima = this.lerVersao(politica.versaoMinima);
    const recomendada = this.lerVersao(politica.versaoRecomendada);
    return {
      atualizacaoObrigatoria: this.compararVersoes(versao, minima) < 0,
      atualizacaoRecomendada: this.compararVersoes(versao, recomendada) < 0,
      plataforma: politica.plataforma,
      versaoInformada,
      versaoMinima: politica.versaoMinima,
      versaoRecomendada: politica.versaoRecomendada,
      ...(politica.mensagem === undefined
        ? {}
        : { mensagem: politica.mensagem }),
      ...(politica.urlLoja === undefined ? {} : { urlLoja: politica.urlLoja }),
    };
  }

  private validarControle(entrada: EntradaAtualizacaoControleRecurso): void {
    if (
      !CODIGO_CONTROLE.test(entrada.codigo) ||
      !['ATIVADO', 'DESATIVADO'].includes(entrada.estado) ||
      !Number.isInteger(entrada.percentualLiberacao) ||
      entrada.percentualLiberacao < 0 ||
      entrada.percentualLiberacao > 100 ||
      !Number.isInteger(entrada.versaoEsperada) ||
      entrada.versaoEsperada < 0 ||
      new Set(entrada.usuariosAlvo).size !== entrada.usuariosAlvo.length ||
      new Set(entrada.filasAlvo).size !== entrada.filasAlvo.length ||
      [...entrada.usuariosAlvo, ...entrada.filasAlvo].some(
        (id) => !IDENTIFICADOR_UUID.test(id),
      )
    ) {
      throw new ErroConfiguracaoReleaseInvalida();
    }
  }

  private validarPolitica(
    entrada: EntradaAtualizacaoPoliticaVersaoMobile,
    minima: readonly [number, number, number],
    recomendada: readonly [number, number, number],
  ): void {
    this.validarPlataforma(entrada.plataforma);
    let urlValida = entrada.urlLoja === undefined;
    if (entrada.urlLoja !== undefined) {
      try {
        const url = new URL(entrada.urlLoja);
        const hostEsperado =
          entrada.plataforma === 'IOS' ? 'apps.apple.com' : 'play.google.com';
        urlValida =
          url.protocol === 'https:' &&
          url.hostname === hostEsperado &&
          url.username.length === 0 &&
          url.password.length === 0;
      } catch {
        urlValida = false;
      }
    }
    if (
      this.compararVersoes(recomendada, minima) < 0 ||
      (entrada.versaoMinima !== '0.0.0' && entrada.urlLoja === undefined) ||
      entrada.mensagem !== undefined &&
        (entrada.mensagem.trim().length < 1 || entrada.mensagem.length > 240) ||
      !urlValida ||
      !Number.isInteger(entrada.versaoEsperada) ||
      entrada.versaoEsperada < 0
    ) {
      throw new ErroConfiguracaoReleaseInvalida();
    }
  }

  private lerVersao(versao: string): readonly [number, number, number] {
    const partes = VERSAO_SEMANTICA.exec(versao);
    if (partes === null) throw new ErroConfiguracaoReleaseInvalida();
    return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  }

  private compararVersoes(
    esquerda: readonly [number, number, number],
    direita: readonly [number, number, number],
  ): number {
    return (
      esquerda[0] - direita[0] ||
      esquerda[1] - direita[1] ||
      esquerda[2] - direita[2]
    );
  }

  private estaNoPercentual(
    codigo: string,
    usuarioId: string,
    percentual: number,
  ): boolean {
    if (percentual <= 0) return false;
    if (percentual >= 100) return true;
    const faixa = createHash('sha256')
      .update(`${codigo}:${usuarioId}`, 'utf8')
      .digest()
      .readUInt32BE(0);
    return faixa < Math.floor((percentual / 100) * 2 ** 32);
  }

  private validarPlataforma(plataforma: string): asserts plataforma is PlataformaMobile {
    if (plataforma !== 'IOS' && plataforma !== 'ANDROID') {
      throw new ErroConfiguracaoReleaseInvalida();
    }
  }

  private validarUuid(valor: string): void {
    if (!IDENTIFICADOR_UUID.test(valor)) {
      throw new ErroConfiguracaoReleaseInvalida();
    }
  }
}
