import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAlvoContextoIndisponivel,
  ErroConflitoVersaoContexto,
  ErroContextoAtendimentoInvalido,
} from './erros-contexto-cliente.js';
import type {
  AlvoContextoAtendimento,
  ContextoAtendimentoPersistido,
  ContextoFinanceiroFluxo,
  EntradaAlteracaoContextoAtendimento,
  EntradaInicializacaoContextoAtendimento,
  EntradaSelecaoClientePorFluxo,
  EntradaSelecaoContratoPorFluxo,
} from './modelo-contexto-cliente.js';
import {
  REPOSITORIO_CONTEXTOS_CLIENTE,
  type RepositorioContextosCliente,
} from './repositorio-contextos-cliente.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ORIGENS_INICIAIS = new Set(['IDENTIFICACAO', 'FLUXO', 'SISTEMA']);

@Injectable()
export class ServicoContextosCliente {
  public constructor(
    @Inject(REPOSITORIO_CONTEXTOS_CLIENTE)
    private readonly repositorio: RepositorioContextosCliente,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async inicializar(
    entrada: EntradaInicializacaoContextoAtendimento,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ContextoAtendimentoPersistido> {
    this.validarInicializacao(entrada);
    const alvo = await this.obterAlvo(entrada, transacao);
    const contexto = this.criarContexto(
      entrada.atendimentoId,
      alvo,
      entrada.origem,
      1,
      relogio,
    );
    if (!(await this.repositorio.criar(contexto, transacao))) {
      throw new ErroContextoAtendimentoInvalido();
    }
    await this.auditarInicializacao(contexto, transacao);
    return contexto;
  }

  public async alterar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAlteracaoContextoAtendimento,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ContextoAtendimentoPersistido> {
    this.validarAlteracao(entrada);
    await this.autorizacao.autorizar(
      {
        permissao: 'ALTERAR_CONTEXTO_CLIENTE',
        recurso: { id: entrada.atendimentoId, tipo: 'CONTEXTO_ATENDIMENTO' },
        sessao,
      },
      async (_autorizacao, transacaoAutorizada) => {
        if (transacaoAutorizada === undefined) {
          return { acessivel: false, estadoPermiteAcao: false };
        }
        const atual = await this.repositorio.obterContexto(
          entrada.atendimentoId,
          transacaoAutorizada,
        );
        if (atual === undefined) {
          return { acessivel: false, estadoPermiteAcao: false };
        }
        const alvo = await this.repositorio.obterAlvoAtivo(
          atual.contatoId,
          entrada.vinculoClienteId,
          entrada.vinculoContratoId,
          transacaoAutorizada,
        );
        return {
          acessivel: alvo !== undefined,
          estadoPermiteAcao: atual.versao === entrada.versaoEsperada,
        };
      },
      transacao,
    );

    const atual = await this.repositorio.obterContexto(
      entrada.atendimentoId,
      transacao,
    );
    if (atual === undefined) throw new ErroContextoAtendimentoInvalido();
    const alvo = await this.obterAlvo(
      { contatoId: atual.contatoId, ...entrada },
      transacao,
    );
    const contexto = this.criarContexto(
      entrada.atendimentoId,
      alvo,
      'USUARIO',
      entrada.versaoEsperada + 1,
      relogio,
      sessao.usuarioId,
    );
    if (
      !(await this.repositorio.alterar(
        contexto,
        entrada.versaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoVersaoContexto();
    }
    await this.auditoria.registrar(
      {
        acao: 'ALTERAR_CONTEXTO_ATENDIMENTO',
        atendimentoId: contexto.atendimentoId,
        contatoId: contexto.contatoId,
        dadosAnteriores: this.resumoAuditoria(atual),
        dadosNovos: this.resumoAuditoria(contexto),
        entidadeId: contexto.atendimentoId,
        entidadeTipo: 'CONTEXTO_ATENDIMENTO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'CONTEXTO_ATENDIMENTO_ALTERADO',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return contexto;
  }

  public async identificarParaFluxo(
    atendimentoId: unknown,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    if (
      typeof atendimentoId !== 'string' ||
      !IDENTIFICADOR_UUID.test(atendimentoId)
    ) {
      throw new ErroContextoAtendimentoInvalido();
    }
    const contatoId = await this.repositorio.obterContatoDoAtendimento(
      atendimentoId,
      transacao,
    );
    const contexto = await this.repositorio.obterContexto(
      atendimentoId,
      transacao,
    );
    if (contatoId === undefined || contexto?.contatoId !== contatoId) {
      return false;
    }
    const alvo = await this.repositorio.obterAlvoAutomatizavel(
      contatoId,
      contexto.vinculoClienteId,
      contexto.vinculoContratoId,
      transacao,
    );
    return alvo !== undefined && this.mesmoAlvo(contexto, alvo);
  }

  public async obterContextoFinanceiroParaFluxo(
    atendimentoId: unknown,
    transacao: TransacaoPrisma,
  ): Promise<ContextoFinanceiroFluxo | undefined> {
    if (
      typeof atendimentoId !== 'string' ||
      !IDENTIFICADOR_UUID.test(atendimentoId)
    ) {
      throw new ErroContextoAtendimentoInvalido();
    }
    const origem = await this.repositorio.obterOrigemDoAtendimento(
      atendimentoId,
      transacao,
    );
    const contexto = await this.repositorio.obterContexto(
      atendimentoId,
      transacao,
    );
    if (
      origem === undefined ||
      contexto?.contatoId !== origem.contatoId ||
      contexto.vinculoContratoId === undefined ||
      contexto.contratoExternoId === undefined
    ) {
      return undefined;
    }
    const alvo = await this.repositorio.obterAlvoAutomatizavel(
      origem.contatoId,
      contexto.vinculoClienteId,
      contexto.vinculoContratoId,
      transacao,
    );
    if (alvo === undefined || !this.mesmoAlvo(contexto, alvo)) {
      return undefined;
    }
    return {
      atendimentoId,
      contaWhatsAppId: origem.contaWhatsAppId,
      contatoId: origem.contatoId,
      contratoExternoId: contexto.contratoExternoId,
      versao: contexto.versao,
    };
  }

  public async selecionarClientePorFluxo(
    entrada: EntradaSelecaoClientePorFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<boolean> {
    this.validarSelecaoFluxo(entrada, entrada.vinculoClienteId);
    const contatoId = await this.repositorio.obterContatoDoAtendimento(
      entrada.atendimentoId,
      transacao,
    );
    if (contatoId === undefined) return false;
    const alvo = await this.repositorio.obterAlvoAutomatizavel(
      contatoId,
      entrada.vinculoClienteId,
      undefined,
      transacao,
    );
    if (alvo === undefined) return false;
    return this.aplicarSelecaoFluxo(entrada, alvo, transacao, relogio);
  }

  public async selecionarContratoPorFluxo(
    entrada: EntradaSelecaoContratoPorFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<boolean> {
    this.validarSelecaoFluxo(entrada, entrada.vinculoContratoId);
    const contatoId = await this.repositorio.obterContatoDoAtendimento(
      entrada.atendimentoId,
      transacao,
    );
    const atual = await this.repositorio.obterContexto(
      entrada.atendimentoId,
      transacao,
    );
    if (contatoId === undefined || atual?.contatoId !== contatoId) {
      return false;
    }
    const alvo = await this.repositorio.obterAlvoAutomatizavel(
      contatoId,
      atual.vinculoClienteId,
      entrada.vinculoContratoId,
      transacao,
    );
    if (alvo === undefined) return false;
    return this.aplicarSelecaoFluxo(entrada, alvo, transacao, relogio, atual);
  }

  private async aplicarSelecaoFluxo(
    ator: {
      readonly atendimentoId: string;
      readonly fluxoId: string;
      readonly versaoFluxoId: string;
    },
    alvo: AlvoContextoAtendimento,
    transacao: TransacaoPrisma,
    relogio: () => Date,
    contextoLido?: ContextoAtendimentoPersistido,
  ): Promise<boolean> {
    const atual =
      contextoLido ??
      (await this.repositorio.obterContexto(ator.atendimentoId, transacao));
    if (atual !== undefined && atual.contatoId !== alvo.contatoId) return false;
    if (atual !== undefined && this.mesmoAlvo(atual, alvo)) return true;
    const contexto = this.criarContexto(
      ator.atendimentoId,
      alvo,
      'FLUXO',
      (atual?.versao ?? 0) + 1,
      relogio,
    );
    const persistiu =
      atual === undefined
        ? await this.repositorio.criar(contexto, transacao)
        : await this.repositorio.alterar(contexto, atual.versao, transacao);
    if (!persistiu) throw new ErroConflitoVersaoContexto();
    await this.auditoria.registrar(
      {
        acao: 'SELECIONAR_CONTEXTO_POR_FLUXO',
        atendimentoId: contexto.atendimentoId,
        contatoId: contexto.contatoId,
        ...(atual === undefined
          ? {}
          : { dadosAnteriores: this.resumoAuditoria(atual) }),
        dadosNovos: this.resumoAuditoria(contexto),
        entidadeId: contexto.atendimentoId,
        entidadeTipo: 'CONTEXTO_ATENDIMENTO',
        fluxoId: ator.fluxoId,
        origem: 'FLUXO',
        tipoEvento: 'CONTEXTO_ATENDIMENTO_SELECIONADO_POR_FLUXO',
        versaoFluxoId: ator.versaoFluxoId,
      },
      transacao,
    );
    return true;
  }

  private mesmoAlvo(
    esquerda: AlvoContextoAtendimento,
    direita: AlvoContextoAtendimento,
  ): boolean {
    return (
      esquerda.contatoId === direita.contatoId &&
      esquerda.vinculoClienteId === direita.vinculoClienteId &&
      esquerda.vinculoContratoId === direita.vinculoContratoId &&
      esquerda.clienteExternoId === direita.clienteExternoId &&
      esquerda.contratoExternoId === direita.contratoExternoId
    );
  }

  private validarSelecaoFluxo(
    ator: {
      readonly atendimentoId: string;
      readonly fluxoId: string;
      readonly versaoFluxoId: string;
    },
    vinculoId: string,
  ): void {
    if (
      !this.uuidsValidos([
        ator.atendimentoId,
        ator.fluxoId,
        ator.versaoFluxoId,
        vinculoId,
      ])
    ) {
      throw new ErroContextoAtendimentoInvalido();
    }
  }

  private async obterAlvo(
    entrada: {
      readonly contatoId: string;
      readonly vinculoClienteId: string;
      readonly vinculoContratoId?: string;
    },
    transacao: TransacaoPrisma,
  ): Promise<AlvoContextoAtendimento> {
    const alvo = await this.repositorio.obterAlvoAtivo(
      entrada.contatoId,
      entrada.vinculoClienteId,
      entrada.vinculoContratoId,
      transacao,
    );
    if (alvo === undefined) throw new ErroAlvoContextoIndisponivel();
    return alvo;
  }

  private criarContexto(
    atendimentoId: string,
    alvo: AlvoContextoAtendimento,
    origem: ContextoAtendimentoPersistido['origem'],
    versao: number,
    relogio: () => Date,
    alteradoPorUsuarioId?: string,
  ): ContextoAtendimentoPersistido {
    const alteradoEm = relogio();
    if (Number.isNaN(alteradoEm.getTime())) {
      throw new ErroContextoAtendimentoInvalido();
    }
    return {
      ...alvo,
      alteradoEm,
      atendimentoId,
      origem,
      versao,
      ...(alteradoPorUsuarioId === undefined
        ? {}
        : { alteradoPorUsuarioId }),
    };
  }

  private async auditarInicializacao(
    contexto: ContextoAtendimentoPersistido,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao: 'INICIALIZAR_CONTEXTO_ATENDIMENTO',
        atendimentoId: contexto.atendimentoId,
        contatoId: contexto.contatoId,
        dadosNovos: this.resumoAuditoria(contexto),
        entidadeId: contexto.atendimentoId,
        entidadeTipo: 'CONTEXTO_ATENDIMENTO',
        origem: 'SISTEMA',
        tipoEvento: 'CONTEXTO_ATENDIMENTO_INICIALIZADO',
      },
      transacao,
    );
  }

  private resumoAuditoria(
    contexto: ContextoAtendimentoPersistido,
  ): Readonly<Record<string, unknown>> {
    return {
      origem: contexto.origem,
      possuiContrato: contexto.vinculoContratoId !== undefined,
      versao: contexto.versao,
      vinculoClienteId: contexto.vinculoClienteId,
      ...(contexto.vinculoContratoId === undefined
        ? {}
        : { vinculoContratoId: contexto.vinculoContratoId }),
    };
  }

  private validarInicializacao(
    entrada: EntradaInicializacaoContextoAtendimento,
  ): void {
    if (
      !this.uuidsValidos([
        entrada.atendimentoId,
        entrada.contatoId,
        entrada.vinculoClienteId,
        entrada.vinculoContratoId,
      ]) ||
      !ORIGENS_INICIAIS.has(entrada.origem)
    ) {
      throw new ErroContextoAtendimentoInvalido();
    }
  }

  private validarAlteracao(entrada: EntradaAlteracaoContextoAtendimento): void {
    if (
      !this.uuidsValidos([
        entrada.atendimentoId,
        entrada.vinculoClienteId,
        entrada.vinculoContratoId,
      ]) ||
      !Number.isSafeInteger(entrada.versaoEsperada) ||
      entrada.versaoEsperada < 1
    ) {
      throw new ErroContextoAtendimentoInvalido();
    }
  }

  private uuidsValidos(valores: readonly (string | undefined)[]): boolean {
    return valores.every(
      (valor) => valor === undefined || IDENTIFICADOR_UUID.test(valor),
    );
  }
}
