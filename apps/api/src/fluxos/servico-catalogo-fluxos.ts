import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ValorJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import {
  ErroConflitoVersaoFluxo,
  ErroFluxoDuplicado,
  ErroFluxoIndisponivel,
  ErroFluxoInvalido,
  ErroVersaoFluxoIndisponivel,
  ErroVersaoFluxoNaoEditavel,
  ErroVersaoPublicadaIndisponivel,
} from './erros-fluxo.js';
import {
  TIPOS_FLUXO,
  type DefinicaoFluxo,
  type EntradaAlteracaoVersaoFluxo,
  type EntradaCriacaoFluxo,
  type EntradaNovaVersaoFluxo,
  type FluxoComVersaoInicial,
  type FluxoPersistido,
  type TipoFluxo,
  type VersaoFluxoPersistida,
} from './modelo-fluxo.js';
import {
  REPOSITORIO_FLUXOS,
  type RepositorioFluxos,
} from './repositorio-fluxos.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECURSO_CATALOGO_FLUXOS = '11111111-1111-4111-8111-111111111169';
const TAMANHO_MAXIMO_DEFINICAO = 262_144;
const PROFUNDIDADE_MAXIMA_DEFINICAO = 30;

@Injectable()
export class ServicoCatalogoFluxos {
  public constructor(
    @Inject(REPOSITORIO_FLUXOS)
    private readonly repositorio: RepositorioFluxos,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async criarFluxo(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaCriacaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<FluxoComVersaoInicial> {
    const nome = this.validarNome(entrada.nome);
    const nomeNormalizado = this.normalizarNome(nome);
    const descricao = this.validarDescricao(entrada.descricao);
    const tipo = this.validarTipo(entrada.tipo);
    const definicao = this.validarDefinicao(entrada.definicaoInicial);
    const versaoSchemaDefinicao = this.validarVersaoSchema(
      entrada.versaoSchemaDefinicao,
      1,
    );
    await this.autorizar(
      sessao,
      'EDITAR_FLUXO',
      RECURSO_CATALOGO_FLUXOS,
      'CATALOGO_FLUXOS',
      transacao,
    );
    await this.repositorio.bloquearNome(nomeNormalizado, transacao);
    const agora = this.obterAgora(relogio);
    const fluxo: FluxoPersistido = {
      ativo: true,
      atualizadoEm: agora,
      criadoEm: agora,
      criadoPorUsuarioId: sessao.usuarioId,
      ...(descricao === undefined ? {} : { descricao }),
      id: randomUUID(),
      nome,
      nomeNormalizado,
      revisao: 1,
      tipo,
    };
    const versao: VersaoFluxoPersistida = {
      atualizadaEm: agora,
      criadaEm: agora,
      criadaPorUsuarioId: sessao.usuarioId,
      definicao,
      estado: 'RASCUNHO',
      fluxoId: fluxo.id,
      id: randomUUID(),
      numeroVersao: 1,
      revisao: 1,
      versaoSchemaDefinicao,
    };
    if (!(await this.repositorio.criarFluxo(fluxo, transacao))) {
      throw new ErroFluxoDuplicado();
    }
    if (!(await this.repositorio.criarVersao(versao, transacao))) {
      throw new ErroConflitoVersaoFluxo();
    }
    await this.auditar(
      sessao,
      'FLUXO_CRIADO',
      'CRIAR_FLUXO',
      fluxo.id,
      'FLUXO',
      {
        tipo: fluxo.tipo,
        versaoFluxoId: versao.id,
        versaoSchemaDefinicao,
      },
      transacao,
    );
    return { fluxo, versao };
  }

  public async criarVersaoRascunho(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaNovaVersaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<VersaoFluxoPersistida> {
    const fluxoId = this.validarId(entrada.fluxoId);
    const definicao = this.validarDefinicao(entrada.definicao);
    const versaoSchemaDefinicao = this.validarVersaoSchema(
      entrada.versaoSchemaDefinicao,
      1,
    );
    await this.autorizar(
      sessao,
      'EDITAR_FLUXO',
      fluxoId,
      'FLUXO',
      transacao,
    );
    await this.repositorio.bloquearFluxo(fluxoId, transacao);
    const fluxo = await this.repositorio.obterFluxo(fluxoId, transacao);
    if (fluxo?.ativo !== true) throw new ErroFluxoIndisponivel();
    const agora = this.obterAgora(relogio);
    const versao: VersaoFluxoPersistida = {
      atualizadaEm: agora,
      criadaEm: agora,
      criadaPorUsuarioId: sessao.usuarioId,
      definicao,
      estado: 'RASCUNHO',
      fluxoId,
      id: randomUUID(),
      numeroVersao: await this.repositorio.obterProximoNumeroVersao(
        fluxoId,
        transacao,
      ),
      revisao: 1,
      versaoSchemaDefinicao,
    };
    if (!(await this.repositorio.criarVersao(versao, transacao))) {
      throw new ErroConflitoVersaoFluxo();
    }
    await this.auditar(
      sessao,
      'VERSAO_FLUXO_CRIADA',
      'CRIAR_VERSAO_FLUXO',
      versao.id,
      'VERSAO_FLUXO',
      {
        fluxoId,
        numeroVersao: versao.numeroVersao,
        versaoSchemaDefinicao,
      },
      transacao,
    );
    return versao;
  }

  public async alterarDefinicaoRascunho(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAlteracaoVersaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<VersaoFluxoPersistida> {
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoEsperada);
    const definicao = this.validarDefinicao(entrada.definicao);
    await this.autorizar(
      sessao,
      'EDITAR_FLUXO',
      versaoFluxoId,
      'VERSAO_FLUXO',
      transacao,
    );
    await this.repositorio.bloquearVersao(versaoFluxoId, transacao);
    const atual = await this.repositorio.obterVersao(versaoFluxoId, transacao);
    if (atual === undefined) throw new ErroVersaoFluxoIndisponivel();
    const fluxo = await this.repositorio.obterFluxo(atual.fluxoId, transacao);
    if (fluxo?.ativo !== true) throw new ErroFluxoIndisponivel();
    if (atual.estado !== 'RASCUNHO') throw new ErroVersaoFluxoNaoEditavel();
    if (atual.revisao !== revisaoEsperada) throw new ErroConflitoVersaoFluxo();
    const alterada: VersaoFluxoPersistida = {
      ...atual,
      atualizadaEm: this.obterAgora(relogio),
      definicao,
      revisao: atual.revisao + 1,
      versaoSchemaDefinicao: this.validarVersaoSchema(
        entrada.versaoSchemaDefinicao,
        atual.versaoSchemaDefinicao,
      ),
    };
    if (
      !(await this.repositorio.alterarRascunho(
        alterada,
        revisaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoVersaoFluxo();
    }
    await this.auditar(
      sessao,
      'VERSAO_FLUXO_ALTERADA',
      'ALTERAR_VERSAO_FLUXO',
      alterada.id,
      'VERSAO_FLUXO',
      {
        fluxoId: alterada.fluxoId,
        numeroVersao: alterada.numeroVersao,
        revisao: alterada.revisao,
        versaoSchemaDefinicao: alterada.versaoSchemaDefinicao,
      },
      transacao,
    );
    return alterada;
  }

  public async obterVersaoPublicadaParaNovaExecucao(
    fluxoIdRecebido: unknown,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida> {
    const fluxoId = this.validarId(fluxoIdRecebido);
    await this.repositorio.bloquearFluxo(fluxoId, transacao);
    const versao = await this.repositorio.obterVersaoPublicada(
      fluxoId,
      transacao,
    );
    if (versao === undefined) throw new ErroVersaoPublicadaIndisponivel();
    return versao;
  }

  public async obterVersaoFixaExecucao(
    versaoFluxoIdRecebido: unknown,
    fluxoIdRecebido: unknown,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida> {
    const versaoFluxoId = this.validarId(versaoFluxoIdRecebido);
    const fluxoId = this.validarId(fluxoIdRecebido);
    const versao = await this.repositorio.obterVersao(
      versaoFluxoId,
      transacao,
    );
    if (
      versao === undefined ||
      versao.fluxoId !== fluxoId ||
      !['PUBLICADA', 'ARQUIVADA'].includes(versao.estado) ||
      versao.publicadaEm === undefined
    ) {
      throw new ErroVersaoFluxoIndisponivel();
    }
    return versao;
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    permissao: 'EDITAR_FLUXO',
    recursoId: string,
    recursoTipo: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao,
        recurso: { id: recursoId, tipo: recursoTipo },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private async auditar(
    sessao: ContextoSessaoAutorizacao,
    tipoEvento: string,
    acao: string,
    entidadeId: string,
    entidadeTipo: string,
    dadosNovos: Readonly<Record<string, unknown>>,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao,
        dadosNovos,
        entidadeId,
        entidadeTipo,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento,
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
  }

  private validarNome(valor: unknown): string {
    if (typeof valor !== 'string') throw new ErroFluxoInvalido();
    const nome = valor.trim().replace(/\s+/gu, ' ');
    if (nome.length < 1 || nome.length > 120) throw new ErroFluxoInvalido();
    return nome;
  }

  private normalizarNome(nome: string): string {
    const normalizado = nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '');
    if (normalizado.length < 1 || normalizado.length > 120) {
      throw new ErroFluxoInvalido();
    }
    return normalizado;
  }

  private validarDescricao(valor: unknown): string | undefined {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string') throw new ErroFluxoInvalido();
    const descricao = valor.trim().replace(/\s+/gu, ' ');
    if (descricao.length < 1 || descricao.length > 500) {
      throw new ErroFluxoInvalido();
    }
    return descricao;
  }

  private validarTipo(valor: unknown): TipoFluxo {
    if (typeof valor !== 'string' || !this.ehTipoFluxo(valor)) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private ehTipoFluxo(valor: string): valor is TipoFluxo {
    return TIPOS_FLUXO.some((tipo) => tipo === valor);
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

  private validarVersaoSchema(valor: unknown, padrao: number): number {
    if (valor === undefined) return padrao;
    if (!Number.isInteger(valor) || typeof valor !== 'number' || valor < 1) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private validarDefinicao(valor: unknown): DefinicaoFluxo {
    if (!this.ehDefinicaoFluxo(valor)) {
      throw new ErroFluxoInvalido();
    }
    let serializado: string;
    try {
      serializado = JSON.stringify(valor);
    } catch {
      throw new ErroFluxoInvalido();
    }
    if (Buffer.byteLength(serializado, 'utf8') > TAMANHO_MAXIMO_DEFINICAO) {
      throw new ErroFluxoInvalido();
    }
    const copia: unknown = JSON.parse(serializado);
    if (!this.ehDefinicaoFluxo(copia)) {
      throw new ErroFluxoInvalido();
    }
    return copia;
  }

  private ehDefinicaoFluxo(valor: unknown): valor is DefinicaoFluxo {
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
    if (profundidade > PROFUNDIDADE_MAXIMA_DEFINICAO) return false;
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

  private obterAgora(relogio: () => Date): Date {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroFluxoInvalido();
    return agora;
  }
}
