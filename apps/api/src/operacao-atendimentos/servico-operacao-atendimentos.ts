import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAtribuicoesAtendimento } from '../atribuicoes-atendimento/servico-atribuicoes-atendimento.js';
import { ErroConflitoResgateAtendimento, ErroConflitoTransferenciaAtendimento, ErroDestinatarioTransferenciaIndisponivel } from '../atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { Prisma } from '../gerado/prisma/client.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ServicoDisponibilidade } from '../disponibilidade/servico-disponibilidade.js';
import { ErroConflitoDisponibilidade } from '../disponibilidade/erros-disponibilidade.js';
import type { EstadoDisponibilidadeUsuario } from '../disponibilidade/modelo-disponibilidade.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import { ServicoNotasInternas } from '../notas-internas/servico-notas-internas.js';
import { ErroNotaInternaInvalida } from '../notas-internas/erros-nota-interna.js';

export interface DestinoTransferencia {
  readonly filaId: string;
  readonly filaNome: string;
  readonly usuarioId?: string;
  readonly usuarioNome?: string;
}

export interface ContextoOperacional {
  readonly atendimentoId: string;
  readonly estado: string;
  readonly filaId: string;
  readonly responsavelId: string | null;
  readonly responsavelNome: string | null;
  readonly versaoAtribuicao: number;
  readonly podeResgatar: boolean;
  readonly podeTransferir: boolean;
  readonly podeAdicionarNota: boolean;
}

@Injectable()
export class ServicoOperacaoAtendimentos {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAtribuicoesAtendimento) private readonly atribuicoes: ServicoAtribuicoesAtendimento,
    @Inject(ServicoIdempotencia) private readonly idempotencia: ServicoIdempotencia,
    @Inject(ServicoDisponibilidade) private readonly disponibilidade: ServicoDisponibilidade,
    @Inject(ServicoEventoDominio) private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoNotasInternas) private readonly notas: ServicoNotasInternas,
  ) {}

  public consultar(sessao: ContextoSessaoAutorizacao, atendimentoId: string): Promise<ContextoOperacional> {
    return this.prisma.executarTransacao((transacao) => this.contexto(sessao, atendimentoId, transacao));
  }

  public async adicionarNota(sessao: ContextoSessaoAutorizacao, atendimentoId: string, chave: string, texto: string, tx: TransacaoPrisma): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`autoridade-saida:${atendimentoId}`}, 0))`);
    const atual = await this.contexto(sessao, atendimentoId, tx);
    if (!atual.podeAdicionarNota) throw new ErroPermissaoNegada();
    const rota = await tx.atendimento.findFirst({ where: { id: atendimentoId, filaAtualId: atual.filaId }, select: { conversaId: true } });
    if (rota === null) throw new ErroPermissaoNegada();
    await this.executarIdempotente(sessao, atendimentoId, chave, 'ADICIONAR_NOTA_INTERNA', [texto], tx, async () => {
      try { await this.notas.adicionar(sessao, rota.conversaId, atendimentoId, atual.filaId, texto, tx); }
      catch (erro) {
        if (erro instanceof ErroNotaInternaInvalida) throw new ExcecaoHttpCanonica(400, 'NOTA_INTERNA_INVALIDA', 'Informe uma nota válida com até 4.000 caracteres.');
        throw erro;
      }
    });
  }

  public async resgatar(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    chaveIdempotencia: string,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    // Mesmo lock do domínio: a leitura da fila não pode preceder uma transferência concorrente.
    await transacao.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`autoridade-saida:${atendimentoId}`}, 0))`);
    const atual = await this.contexto(sessao, atendimentoId, transacao);
    // Revalidar a capacidade inclusive em repetição; não devolver contexto histórico do recibo.
    await this.autorizacao.autorizar({
      filaId: atual.filaId, permissao: 'RESGATAR_ATENDIMENTO',
      recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao,
    }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
    await this.executarIdempotente(sessao, atendimentoId, chaveIdempotencia, 'RESGATAR_ATENDIMENTO', [versaoEsperada], transacao, async () => {
      try {
        await this.atribuicoes.resgatar(sessao, atendimentoId, atual.filaId, versaoEsperada, transacao);
      } catch (erro) {
        if (erro instanceof ErroConflitoResgateAtendimento) throw new ExcecaoHttpCanonica(409, 'CONFLITO_RESGATE_ATENDIMENTO', 'O atendimento mudou. Consulte o contexto atualizado.');
        throw erro;
      }
    });
  }

  public async destinos(sessao: ContextoSessaoAutorizacao, atendimentoId: string): Promise<readonly DestinoTransferencia[]> {
    return this.prisma.executarTransacao(async (tx) => {
      const atual = await this.contexto(sessao, atendimentoId, tx);
      if (!atual.podeTransferir) throw new ErroPermissaoNegada();
      const autoridade = await this.autorizacao.autorizar({ sessao, filaId: atual.filaId, permissao: 'TRANSFERIR_ATENDIMENTO', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), tx);
      const resultado: DestinoTransferencia[] = [];
      // IDs de roteamento primeiro; nomes apenas depois da autorização.
      const filas = await tx.fila.findMany({
        where: { estado: 'ATIVA', ...(autoridade.papelBase === 'ADMINISTRADOR' ? {} : { acessosUsuarios: { some: { usuarioId: sessao.usuarioId, estado: 'ATIVO' } } }) },
        select: { id: true }, orderBy: { id: 'asc' }, take: 101,
      });
      if (filas.length > 100) throw new ExcecaoHttpCanonica(409, 'LIMITE_DESTINOS_TRANSFERENCIA', 'Há muitos destinos. É necessário restringir as filas antes de transferir.');
      for (const fila of filas) {
        try {
          await this.autorizacao.autorizar({ sessao, filaId: fila.id, permissao: 'TRANSFERIR_ATENDIMENTO', recurso: { id: fila.id, tipo: 'FILA' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), tx);
        } catch (erro) { if (erro instanceof ErroPermissaoNegada) continue; throw erro; }
        const destino = await tx.fila.findUniqueOrThrow({ where: { id: fila.id }, select: { nome: true } });
        if (fila.id !== atual.filaId) resultado.push({ filaId: fila.id, filaNome: destino.nome });
        const usuarios = await tx.usuario.findMany({
          where: { estado: 'ATIVO', disponibilidade: { estado: 'DISPONIVEL' },
            OR: [{ acessosFila: { some: { filaId: fila.id, estado: 'ATIVO' } } }, { perfil: { papelBase: 'ADMINISTRADOR', estado: 'ATIVO' } }] },
          select: { id: true }, orderBy: { id: 'asc' }, take: 101,
        });
        if (usuarios.length > 100) throw new ExcecaoHttpCanonica(409, 'LIMITE_DESTINOS_TRANSFERENCIA', 'Há muitos destinatários. É necessário restringir a seleção antes de transferir.');
        for (const usuario of usuarios) {
          if (fila.id === atual.filaId && usuario.id === atual.responsavelId) continue;
          try { await this.autorizacao.autorizarUsuario({ usuarioId: usuario.id, filaId: fila.id, permissao: 'RECEBER_TRANSFERENCIA' }, tx); }
          catch (erro) { if (erro instanceof ErroPermissaoNegada) continue; throw erro; }
          const pessoa = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { nomeExibicao: true } });
          resultado.push({ filaId: fila.id, filaNome: destino.nome, usuarioId: usuario.id, usuarioNome: pessoa.nomeExibicao });
        }
      }
      return resultado;
    });
  }

  public async transferir(sessao: ContextoSessaoAutorizacao, atendimentoId: string, chave: string, versao: number, filaDestinoId: string, usuarioDestinoId: string | undefined, tx: TransacaoPrisma): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`autoridade-saida:${atendimentoId}`}, 0))`);
    const atual = await this.contexto(sessao, atendimentoId, tx);
    if (!atual.podeTransferir) throw new ErroPermissaoNegada();
    await this.autorizacao.autorizar({ sessao, filaId: filaDestinoId, permissao: 'TRANSFERIR_ATENDIMENTO', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), tx);
    if (usuarioDestinoId !== undefined) {
      await this.autorizacao.autorizarUsuario({ usuarioId: usuarioDestinoId, filaId: filaDestinoId, permissao: 'RECEBER_TRANSFERENCIA' }, tx);
    }
    await this.executarIdempotente(sessao, atendimentoId, chave, 'TRANSFERIR_ATENDIMENTO', [versao, filaDestinoId, usuarioDestinoId ?? null], tx, async () => {
      try {
        if (usuarioDestinoId === undefined) await this.atribuicoes.transferirParaFila(sessao, atendimentoId, filaDestinoId, versao, tx);
        else {
          // Serializa com a alteração manual de disponibilidade antes da decisão final.
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`disponibilidade:${usuarioDestinoId}`}, 0))`);
          await this.atribuicoes.transferirParaUsuario(sessao, atendimentoId, filaDestinoId, usuarioDestinoId, versao, tx);
        }
      } catch (erro) {
        if (erro instanceof ErroConflitoTransferenciaAtendimento || erro instanceof ErroDestinatarioTransferenciaIndisponivel) throw new ExcecaoHttpCanonica(409, 'CONFLITO_TRANSFERENCIA_ATENDIMENTO', 'O atendimento ou o destino mudou. Confira a seleção novamente.');
        throw erro;
      }
    });
  }

  public consultarDisponibilidade(sessao: ContextoSessaoAutorizacao) {
    return this.prisma.executarTransacao(async (tx) => {
      await this.autorizarDisponibilidade(sessao, tx);
      const atual = await tx.disponibilidadeUsuario.findUnique({ where: { usuarioId: sessao.usuarioId }, select: { estado: true, versao: true } });
      return { estado: atual?.estado ?? 'INDISPONIVEL', versao: atual?.versao ?? 0 };
    });
  }

  public async definirDisponibilidade(sessao: ContextoSessaoAutorizacao, chave: string, estado: EstadoDisponibilidadeUsuario, versao: number, tx: TransacaoPrisma): Promise<void> {
    await this.autorizarDisponibilidade(sessao, tx);
    await this.executarIdempotente(sessao, sessao.usuarioId, chave, 'DEFINIR_DISPONIBILIDADE', [estado, versao], tx, async () => {
      try {
        const resultado = await this.disponibilidade.definir(sessao, sessao.usuarioId, estado, versao, tx);
        if (resultado.versao !== versao) await this.eventos.acrescentar({
          tipo: 'DISPONIBILIDADE_USUARIO_ALTERADA', entidadeTipo: 'USUARIO',
          entidadeId: sessao.usuarioId, usuarioAtorId: sessao.usuarioId,
          classificacaoDados: 'OPERACIONAL', dados: { estado, versao: resultado.versao },
        }, tx);
      }
      catch (erro) {
        if (erro instanceof ErroConflitoDisponibilidade) throw new ExcecaoHttpCanonica(409, 'CONFLITO_DISPONIBILIDADE', 'Sua disponibilidade mudou. Confira o estado atual.');
        throw erro;
      }
    });
  }

  private autorizarDisponibilidade(sessao: ContextoSessaoAutorizacao, tx: TransacaoPrisma) {
    return this.autorizacao.autorizar({ sessao, permissao: 'ALTERAR_DISPONIBILIDADE_PROPRIA', recurso: { id: sessao.usuarioId, tipo: 'DISPONIBILIDADE_USUARIO' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), tx);
  }

  private async executarIdempotente(sessao: ContextoSessaoAutorizacao, entidadeId: string, chaveIdempotencia: string, tipo: string, conteudo: readonly unknown[], transacao: TransacaoPrisma, executar: () => Promise<void>): Promise<void> {
    let registro;
    try {
      registro = await this.idempotencia.iniciarOuObter({
        assinaturaRequisicaoHash: createHash('sha256').update(JSON.stringify([
          tipo, entidadeId, ...conteudo,
        ])).digest('hex'),
        chaveIdempotencia, entidadeId, entidadeTipo: tipo === 'DEFINIR_DISPONIBILIDADE' ? 'DISPONIBILIDADE_USUARIO' : 'ATENDIMENTO',
        escopoId: sessao.usuarioId, escopoTipo: 'OPERACAO_ATENDIMENTO', tipoOperacao: tipo,
      }, transacao);
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'CHAVE_IDEMPOTENCIA_REUTILIZADA') {
        throw new ExcecaoHttpCanonica(409, 'CHAVE_IDEMPOTENCIA_REUTILIZADA', 'Esta tentativa possui conteúdo diferente da original.');
      }
      throw erro;
    }
    if (registro.situacao === 'EXISTENTE') {
      if (registro.operacao.estado !== 'CONCLUIDA') throw new ExcecaoHttpCanonica(409, 'OPERACAO_EM_ANDAMENTO', 'A operação ainda não foi confirmada.');
      return;
    }
    const concessao = await this.idempotencia.concederExecucao(registro.operacao.id, 30_000, transacao);
    await executar();
    await this.idempotencia.concluir({ operacaoId: concessao.operacaoId, tokenConcessao: concessao.tokenConcessao, dados: { confirmado: true } }, transacao);
  }

  private async contexto(sessao: ContextoSessaoAutorizacao, atendimentoId: string, transacao: TransacaoPrisma): Promise<ContextoOperacional> {
    // Somente roteamento interno antes da autorização; nenhum conteúdo ou nome é carregado.
    const rota = await transacao.atendimento.findUnique({ where: { id: atendimentoId }, select: { filaAtualId: true } });
    if (rota?.filaAtualId == null) throw new ErroPermissaoNegada();
    const filaId = rota.filaAtualId;
    await this.autorizacao.autorizar({ filaId, permissao: 'VISUALIZAR_FILA', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({
      acessivel: await transacao.atendimento.count({ where: { id: atendimentoId, filaAtualId: filaId } }) === 1,
      estadoPermiteAcao: true,
    }), transacao);
    const atendimento = await transacao.atendimento.findFirst({ where: { id: atendimentoId, filaAtualId: filaId }, select: {
      estado: true, modo: true, usuarioResponsavelId: true, versaoAtribuicao: true,
      usuarioResponsavel: { select: { nomeExibicao: true } },
    } });
    if (atendimento === null) throw new ErroPermissaoNegada();
    let podeResgatar = false;
    if (atendimento.estado === 'AGUARDANDO' && atendimento.modo === 'FILA_HUMANA' && atendimento.usuarioResponsavelId === null) {
      try {
        await this.autorizacao.autorizar({ filaId, permissao: 'RESGATAR_ATENDIMENTO', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
        podeResgatar = true;
      } catch (erro) {
        if (!(erro instanceof ErroPermissaoNegada)) throw erro;
      }
    }
    let podeTransferir = false;
    if (['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atendimento.estado)) {
      try {
        await this.autorizacao.autorizar({ sessao, filaId, permissao: 'TRANSFERIR_ATENDIMENTO', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
        podeTransferir = true;
      } catch (erro) { if (!(erro instanceof ErroPermissaoNegada)) throw erro; }
    }
    let podeAdicionarNota = false;
    if (['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atendimento.estado)) {
      try {
        await this.autorizacao.autorizar({ sessao, filaId, permissao: 'ADICIONAR_NOTA_INTERNA', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' } }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
        podeAdicionarNota = true;
      } catch (erro) { if (!(erro instanceof ErroPermissaoNegada)) throw erro; }
    }
    return { atendimentoId, estado: atendimento.estado, filaId, responsavelId: atendimento.usuarioResponsavelId, podeTransferir, podeAdicionarNota,
      responsavelNome: atendimento.usuarioResponsavel?.nomeExibicao ?? null, versaoAtribuicao: atendimento.versaoAtribuicao, podeResgatar };
  }
}
