import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAtribuicoesAtendimento } from '../atribuicoes-atendimento/servico-atribuicoes-atendimento.js';
import { ErroConflitoResgateAtendimento } from '../atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { Prisma } from '../gerado/prisma/client.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ServicoIdempotencia } from '../idempotencia/servico-idempotencia.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export interface ContextoOperacional {
  readonly atendimentoId: string;
  readonly estado: string;
  readonly filaId: string;
  readonly responsavelId: string | null;
  readonly responsavelNome: string | null;
  readonly versaoAtribuicao: number;
  readonly podeResgatar: boolean;
}

@Injectable()
export class ServicoOperacaoAtendimentos {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAtribuicoesAtendimento) private readonly atribuicoes: ServicoAtribuicoesAtendimento,
    @Inject(ServicoIdempotencia) private readonly idempotencia: ServicoIdempotencia,
  ) {}

  public consultar(sessao: ContextoSessaoAutorizacao, atendimentoId: string): Promise<ContextoOperacional> {
    return this.prisma.executarTransacao((transacao) => this.contexto(sessao, atendimentoId, transacao));
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
    let registro;
    try {
      registro = await this.idempotencia.iniciarOuObter({
        assinaturaRequisicaoHash: createHash('sha256').update(JSON.stringify([
          'RESGATAR_ATENDIMENTO', atendimentoId, versaoEsperada,
        ])).digest('hex'),
        chaveIdempotencia, entidadeId: atendimentoId, entidadeTipo: 'ATENDIMENTO',
        escopoId: sessao.usuarioId, escopoTipo: 'OPERACAO_ATENDIMENTO', tipoOperacao: 'RESGATAR_ATENDIMENTO',
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
    try {
      await this.atribuicoes.resgatar(sessao, atendimentoId, atual.filaId, versaoEsperada, transacao);
    } catch (erro) {
      if (erro instanceof ErroConflitoResgateAtendimento) {
        throw new ExcecaoHttpCanonica(409, 'CONFLITO_RESGATE_ATENDIMENTO', 'O atendimento mudou. Consulte o contexto atualizado.');
      }
      throw erro;
    }
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
      estado: true, usuarioResponsavelId: true, versaoAtribuicao: true,
      usuarioResponsavel: { select: { nomeExibicao: true } },
    } });
    if (atendimento === null) throw new ErroPermissaoNegada();
    let podeResgatar = false;
    if (atendimento.estado === 'AGUARDANDO' && atendimento.usuarioResponsavelId === null) {
      try {
        await this.autorizacao.autorizar({ filaId, permissao: 'RESGATAR_ATENDIMENTO', recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
        podeResgatar = true;
      } catch (erro) {
        if (!(erro instanceof ErroPermissaoNegada)) throw erro;
      }
    }
    return { atendimentoId, estado: atendimento.estado, filaId, responsavelId: atendimento.usuarioResponsavelId,
      responsavelNome: atendimento.usuarioResponsavel?.nomeExibicao ?? null, versaoAtribuicao: atendimento.versaoAtribuicao, podeResgatar };
  }
}
