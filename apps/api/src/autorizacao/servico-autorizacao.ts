import { Inject, Injectable } from '@nestjs/common';

import {
  ErroNaoAutenticado,
  ErroPermissaoNegada,
} from './erros-autorizacao.js';
import {
  MATRIZ_PERMISSOES_BASE,
  PERMISSOES_COM_ESCOPO_FILA,
} from './matriz-permissoes.js';
import type {
  AutorizacaoConcedida,
  CodigoPermissaoAutorizacao,
  ContextoUsuarioAutorizacao,
  EntradaAutorizacao,
  VerificadorRecursoAutorizavel,
} from './modelo-autorizacao.js';
import { CODIGOS_PERMISSAO } from './modelo-autorizacao.js';
import {
  REPOSITORIO_AUTORIZACAO,
  type RepositorioAutorizacao,
} from './repositorio-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NOME_CANONICO = /^[A-Z][A-Z0-9_]{2,99}$/u;
const CODIGOS_PERMISSAO_VALIDOS = new Set<string>(CODIGOS_PERMISSAO);

@Injectable()
export class ServicoAutorizacao {
  public constructor(
    @Inject(REPOSITORIO_AUTORIZACAO)
    private readonly repositorio: RepositorioAutorizacao,
  ) {}

  public async autorizar(
    entrada: EntradaAutorizacao,
    verificarRecurso: VerificadorRecursoAutorizavel,
    transacao?: TransacaoPrisma,
  ): Promise<AutorizacaoConcedida> {
    this.validarEntrada(entrada);
    this.validarSessao(entrada);

    const contexto = await this.repositorio.obterContexto(
      entrada.sessao.usuarioId,
      entrada.filaId,
      transacao,
    );
    if (!this.usuarioPodeExecutar(contexto, entrada.permissao)) {
      throw new ErroPermissaoNegada();
    }
    if (!this.escopoFilaPermitido(contexto, entrada)) {
      throw new ErroPermissaoNegada();
    }

    const autorizacao: AutorizacaoConcedida = {
      ...(entrada.filaId === undefined ? {} : { filaId: entrada.filaId }),
      papelBase: contexto.papelBase,
      permissao: entrada.permissao,
      recurso: entrada.recurso,
      sessaoId: entrada.sessao.sessaoId,
      usuarioId: entrada.sessao.usuarioId,
    };
    const recurso = await verificarRecurso(autorizacao, transacao);
    if (!recurso.acessivel || !recurso.estadoPermiteAcao) {
      throw new ErroPermissaoNegada();
    }

    return autorizacao;
  }

  private usuarioPodeExecutar(
    contexto: ContextoUsuarioAutorizacao | undefined,
    permissao: CodigoPermissaoAutorizacao,
  ): contexto is ContextoUsuarioAutorizacao & {
    papelBase: NonNullable<ContextoUsuarioAutorizacao['papelBase']>;
  } {
    if (
      contexto === undefined ||
      !contexto.usuarioAtivo ||
      !contexto.perfilAtivo ||
      contexto.papelBase === undefined
    ) {
      return false;
    }

    const ajuste = contexto.ajustes.find(({ codigo }) => codigo === permissao);
    if (ajuste?.efeito === 'NEGAR') {
      return false;
    }
    if (ajuste?.efeito === 'CONCEDER') {
      return true;
    }

    return MATRIZ_PERMISSOES_BASE[contexto.papelBase].includes(permissao);
  }

  private escopoFilaPermitido(
    contexto: ContextoUsuarioAutorizacao,
    entrada: EntradaAutorizacao,
  ): boolean {
    if (!PERMISSOES_COM_ESCOPO_FILA.has(entrada.permissao)) {
      return true;
    }
    if (entrada.filaId === undefined || !contexto.filaAtiva) {
      return false;
    }

    return contexto.papelBase === 'ADMINISTRADOR' || contexto.acessoFilaAtivo;
  }

  private validarSessao(entrada: EntradaAutorizacao): void {
    if (
      entrada.sessao.estado !== 'ATIVA' ||
      Number.isNaN(entrada.sessao.expiraEm.getTime()) ||
      entrada.sessao.expiraEm <= new Date()
    ) {
      throw new ErroNaoAutenticado();
    }
  }

  private validarEntrada(entrada: EntradaAutorizacao): void {
    if (
      !IDENTIFICADOR_UUID.test(entrada.sessao.sessaoId) ||
      !IDENTIFICADOR_UUID.test(entrada.sessao.usuarioId) ||
      !IDENTIFICADOR_UUID.test(entrada.recurso.id) ||
      !NOME_CANONICO.test(entrada.recurso.tipo) ||
      !CODIGOS_PERMISSAO_VALIDOS.has(entrada.permissao) ||
      !(entrada.sessao.expiraEm instanceof Date) ||
      (entrada.filaId !== undefined && !IDENTIFICADOR_UUID.test(entrada.filaId))
    ) {
      throw new Error('ENTRADA_AUTORIZACAO_INVALIDA');
    }
  }
}
