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
  EntradaAlteracaoContextoAtendimento,
  EntradaInicializacaoContextoAtendimento,
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
