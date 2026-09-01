import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoInvalidacaoPermissoes } from '../autorizacao/servico-invalidacao-permissoes.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroFilaDuplicada,
  ErroFilaIndisponivel,
  ErroFilaInvalida,
  ErroUsuarioFilaIndisponivel,
} from './erros-fila.js';
import type {
  AcessoUsuarioFilaPersistido,
  EntradaCadastroFila,
  FilaPersistida,
} from './modelo-fila.js';
import {
  REPOSITORIO_FILAS,
  type RepositorioFilas,
} from './repositorio-filas.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECURSO_ADMINISTRACAO_FILAS = '11111111-1111-4111-8111-111111111123';

@Injectable()
export class ServicoFilas {
  public constructor(
    @Inject(REPOSITORIO_FILAS)
    private readonly repositorio: RepositorioFilas,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ServicoInvalidacaoPermissoes)
    private readonly invalidacaoPermissoes: ServicoInvalidacaoPermissoes,
  ) {}

  public async cadastrar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaCadastroFila,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<FilaPersistida> {
    const nome = this.validarNome(entrada.nome);
    const nomeNormalizado = this.normalizarNome(nome);
    await this.autorizar(sessao, transacao, RECURSO_ADMINISTRACAO_FILAS);
    await this.repositorio.bloquearNome(nomeNormalizado, transacao);
    const agora = this.obterAgora(relogio);
    const fila: FilaPersistida = {
      atualizadoEm: agora,
      criadoEm: agora,
      estado: 'ATIVA',
      id: randomUUID(),
      nome,
      nomeNormalizado,
    };
    if (!(await this.repositorio.criarFila(fila, transacao))) {
      throw new ErroFilaDuplicada();
    }
    await this.auditar(sessao, 'FILA_CADASTRADA', 'CADASTRAR_FILA', fila.id, transacao, {
      estado: 'ATIVA',
    });
    return fila;
  }

  public async inativar(
    sessao: ContextoSessaoAutorizacao,
    filaId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<void> {
    this.validarIds(filaId);
    await this.autorizar(sessao, transacao, filaId);
    await this.repositorio.bloquearFila(filaId, transacao);
    const fila = await this.repositorio.obterFila(filaId, transacao);
    if (fila === undefined) throw new ErroFilaIndisponivel();
    if (fila.estado === 'INATIVA') return;
    const usuariosAfetados =
      await this.repositorio.listarUsuariosAfetadosFila(filaId, transacao);
    const agora = this.obterAgora(relogio);
    if (!(await this.repositorio.inativarFila(filaId, agora, transacao))) {
      throw new ErroFilaIndisponivel();
    }
    await this.auditar(sessao, 'FILA_INATIVADA', 'INATIVAR_FILA', filaId, transacao, {
      estado: 'INATIVA',
    });
    for (const usuarioAlvoId of usuariosAfetados) {
      await this.invalidacaoPermissoes.registrar(
        {
          filaId,
          motivo: 'FILA_INATIVADA',
          usuarioAlvoId,
          usuarioAtorId: sessao.usuarioId,
        },
        transacao,
      );
    }
  }

  public async concederAcesso(
    sessao: ContextoSessaoAutorizacao,
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<AcessoUsuarioFilaPersistido> {
    this.validarIds(filaId, usuarioId);
    await this.autorizar(sessao, transacao, filaId);
    await this.repositorio.bloquearVinculo(filaId, usuarioId, transacao);
    const [fila, usuarioAtivo, atual] = await Promise.all([
      this.repositorio.obterFila(filaId, transacao),
      this.repositorio.usuarioEstaAtivo(usuarioId, transacao),
      this.repositorio.obterAcesso(filaId, usuarioId, transacao),
    ]);
    if (fila?.estado !== 'ATIVA') throw new ErroFilaIndisponivel();
    if (!usuarioAtivo) throw new ErroUsuarioFilaIndisponivel();
    if (atual?.estado === 'ATIVO') return atual;
    const agora = this.obterAgora(relogio);
    const acesso: AcessoUsuarioFilaPersistido = {
      criadoEm: agora,
      estado: 'ATIVO',
      filaId,
      usuarioId,
    };
    await this.repositorio.concederAcesso(acesso, transacao);
    await this.invalidacaoPermissoes.registrar(
      {
        filaId,
        motivo: 'ACESSO_FILA_CONCEDIDO',
        usuarioAlvoId: usuarioId,
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.auditar(sessao, 'ACESSO_USUARIO_FILA_CONCEDIDO', 'CONCEDER_ACESSO_FILA', filaId, transacao, {
      usuarioId,
    });
    return acesso;
  }

  public async revogarAcesso(
    sessao: ContextoSessaoAutorizacao,
    filaId: string,
    usuarioId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<void> {
    this.validarIds(filaId, usuarioId);
    await this.autorizar(sessao, transacao, filaId);
    await this.repositorio.bloquearVinculo(filaId, usuarioId, transacao);
    const atual = await this.repositorio.obterAcesso(filaId, usuarioId, transacao);
    if (atual === undefined || atual.estado === 'REVOGADO') return;
    const agora = this.obterAgora(relogio);
    if (!(await this.repositorio.revogarAcesso(filaId, usuarioId, agora, transacao))) {
      throw new ErroFilaIndisponivel();
    }
    await this.invalidacaoPermissoes.registrar(
      {
        filaId,
        motivo: 'ACESSO_FILA_REVOGADO',
        usuarioAlvoId: usuarioId,
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.auditar(sessao, 'ACESSO_USUARIO_FILA_REVOGADO', 'REVOGAR_ACESSO_FILA', filaId, transacao, {
      usuarioId,
    });
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    transacao: TransacaoPrisma,
    recursoId: string,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_FILAS',
        recurso: { id: recursoId, tipo: 'ADMINISTRACAO_FILAS' },
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
    filaId: string,
    transacao: TransacaoPrisma,
    dadosNovos: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao,
        dadosNovos,
        entidadeId: filaId,
        entidadeTipo: 'FILA',
        filaId,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento,
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
  }

  private validarNome(valor: unknown): string {
    if (typeof valor !== 'string') throw new ErroFilaInvalida();
    const nome = valor.trim().replace(/\s+/gu, ' ');
    if (nome.length < 1 || nome.length > 120) throw new ErroFilaInvalida();
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
      throw new ErroFilaInvalida();
    }
    return normalizado;
  }

  private validarIds(...ids: string[]): void {
    if (ids.some((id) => !UUID.test(id))) throw new ErroFilaInvalida();
  }

  private obterAgora(relogio: () => Date): Date {
    const agora = relogio();
    if (Number.isNaN(agora.getTime())) throw new ErroFilaInvalida();
    return agora;
  }
}
