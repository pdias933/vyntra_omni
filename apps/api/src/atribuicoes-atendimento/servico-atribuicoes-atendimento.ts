import { Inject, Injectable } from '@nestjs/common';

import { MaquinaEstadoAtendimento } from '../atendimentos/maquina-estado-atendimento.js';
import type { AtendimentoPersistido } from '../atendimentos/modelo-atendimento.js';
import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import { ServicoHistoricoAtribuicao } from '../historico-atribuicao/servico-historico-atribuicao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAtendimentoAtribuicaoAusente,
  ErroConflitoResgateAtendimento,
  ErroConflitoTransferenciaAtendimento,
  ErroEntradaAtribuicaoAtendimentoInvalida,
} from './erros-atribuicoes-atendimento.js';
import {
  REPOSITORIO_ATRIBUICOES_ATENDIMENTO,
  type RepositorioAtribuicoesAtendimento,
} from './repositorio-atribuicoes-atendimento.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoAtribuicoesAtendimento {
  private readonly maquina = new MaquinaEstadoAtendimento();

  public constructor(
    @Inject(REPOSITORIO_ATRIBUICOES_ATENDIMENTO)
    private readonly repositorio: RepositorioAtribuicoesAtendimento,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoHistoricoAtribuicao)
    private readonly historico: ServicoHistoricoAtribuicao,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async resgatar(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    filaEsperadaId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<AtendimentoPersistido> {
    this.validarEntrada(
      atendimentoId,
      filaEsperadaId,
      versaoAtribuicaoEsperada,
    );
    await this.autorizar(
      sessao,
      'VISUALIZAR_FILA',
      atendimentoId,
      filaEsperadaId,
      transacao,
    );
    await this.autorizar(
      sessao,
      'RESGATAR_ATENDIMENTO',
      atendimentoId,
      filaEsperadaId,
      transacao,
    );
    const atual = await this.repositorio.obter(atendimentoId, transacao);
    if (atual === undefined) throw new ErroAtendimentoAtribuicaoAusente();
    if (
      atual.estado !== 'AGUARDANDO' ||
      atual.usuarioResponsavelId !== undefined ||
      atual.versaoAtribuicao !== versaoAtribuicaoEsperada
    ) {
      throw new ErroConflitoResgateAtendimento(
        atual.usuarioResponsavelId,
      );
    }
    const agora = relogio();
    const proximo = this.maquina.transitar(
      atual,
      {
        filaId: filaEsperadaId,
        tipo: 'ATRIBUIR_HUMANO',
        usuarioId: sessao.usuarioId,
      },
      agora,
    );
    const venceu = await this.repositorio.resgatarCondicional(
      proximo,
      filaEsperadaId,
      versaoAtribuicaoEsperada,
      transacao,
    );
    if (!venceu) {
      const vencedor = await this.repositorio.obter(atendimentoId, transacao);
      throw new ErroConflitoResgateAtendimento(
        vencedor?.usuarioResponsavelId,
      );
    }
    await this.historico.substituir(
      atendimentoId,
      {
        executadoPorUsuarioId: sessao.usuarioId,
        filaId: filaEsperadaId,
        tipo: 'RESGATE',
        usuarioResponsavelId: sessao.usuarioId,
      },
      transacao,
      () => agora,
    );
    await this.eventos.acrescentar(
      {
        atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: proximo.conversaId,
        dados: {
          filaId: filaEsperadaId,
          usuarioResponsavelId: sessao.usuarioId,
          versaoAtribuicao: proximo.versaoAtribuicao,
        },
        entidadeId: atendimentoId,
        entidadeTipo: 'ATENDIMENTO',
        tipo: 'ATENDIMENTO_RESGATADO',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.auditoria.registrar(
      {
        acao: 'RESGATAR_ATENDIMENTO',
        atendimentoId,
        dadosAnteriores: {
          estado: atual.estado,
          usuarioResponsavelId: atual.usuarioResponsavelId ?? null,
          versaoAtribuicao: atual.versaoAtribuicao,
        },
        dadosNovos: {
          estado: proximo.estado,
          usuarioResponsavelId: proximo.usuarioResponsavelId,
          versaoAtribuicao: proximo.versaoAtribuicao,
        },
        entidadeId: atendimentoId,
        entidadeTipo: 'ATENDIMENTO',
        filaId: filaEsperadaId,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'ATENDIMENTO_RESGATADO',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return proximo;
  }

  public async transferirParaFila(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    filaDestinoId: string,
    versaoAtribuicaoEsperada: number,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<AtendimentoPersistido> {
    this.validarEntrada(atendimentoId, filaDestinoId, versaoAtribuicaoEsperada);
    const atual = await this.repositorio.obter(atendimentoId, transacao);
    if (atual === undefined || atual.filaAtualId === undefined) {
      throw new ErroAtendimentoAtribuicaoAusente();
    }
    if (
      atual.filaAtualId === filaDestinoId ||
      !['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atual.estado) ||
      atual.versaoAtribuicao !== versaoAtribuicaoEsperada
    ) {
      throw new ErroConflitoTransferenciaAtendimento();
    }
    const filaOrigemId = atual.filaAtualId;
    await this.autorizarTransferencia(
      sessao,
      atendimentoId,
      filaOrigemId,
      true,
      transacao,
    );
    await this.autorizarTransferencia(
      sessao,
      atendimentoId,
      filaDestinoId,
      false,
      transacao,
    );
    const agora = relogio();
    const proximo = this.maquina.transitar(
      atual,
      { filaId: filaDestinoId, tipo: 'TRANSFERIR_FILA' },
      agora,
    );
    if (
      !(await this.repositorio.transferirParaFilaCondicional(
        proximo,
        filaOrigemId,
        versaoAtribuicaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoTransferenciaAtendimento();
    }
    await this.historico.substituir(
      atendimentoId,
      {
        executadoPorUsuarioId: sessao.usuarioId,
        filaId: filaDestinoId,
        tipo: 'TRANSFERENCIA_FILA',
      },
      transacao,
      () => agora,
    );
    await this.eventos.acrescentar(
      {
        atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: proximo.conversaId,
        dados: {
          filaDestinoId,
          filaOrigemId,
          versaoAtribuicao: proximo.versaoAtribuicao,
        },
        entidadeId: atendimentoId,
        entidadeTipo: 'ATENDIMENTO',
        tipo: 'ATENDIMENTO_TRANSFERIDO_PARA_FILA',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.auditoria.registrar(
      {
        acao: 'TRANSFERIR_ATENDIMENTO',
        atendimentoId,
        dadosAnteriores: {
          filaId: filaOrigemId,
          usuarioResponsavelId: atual.usuarioResponsavelId ?? null,
          versaoAtribuicao: atual.versaoAtribuicao,
        },
        dadosNovos: {
          filaId: filaDestinoId,
          usuarioResponsavelId: null,
          versaoAtribuicao: proximo.versaoAtribuicao,
        },
        entidadeId: atendimentoId,
        entidadeTipo: 'ATENDIMENTO',
        filaId: filaDestinoId,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'ATENDIMENTO_TRANSFERIDO_PARA_FILA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return proximo;
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    permissao: 'VISUALIZAR_FILA' | 'RESGATAR_ATENDIMENTO',
    atendimentoId: string,
    filaId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        filaId,
        permissao,
        recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => {
        const atendimento = await this.repositorio.obter(
          atendimentoId,
          transacao,
        );
        return {
          acessivel: atendimento?.filaAtualId === filaId,
          estadoPermiteAcao: true,
        };
      },
      transacao,
    );
  }

  private async autorizarTransferencia(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    filaId: string,
    conferirFilaAtual: boolean,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        filaId,
        permissao: 'TRANSFERIR_ATENDIMENTO',
        recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => {
        if (!conferirFilaAtual) {
          return { acessivel: true, estadoPermiteAcao: true };
        }
        const atendimento = await this.repositorio.obter(
          atendimentoId,
          transacao,
        );
        return {
          acessivel: atendimento?.filaAtualId === filaId,
          estadoPermiteAcao:
            atendimento !== undefined &&
            ['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atendimento.estado),
        };
      },
      transacao,
    );
  }

  private validarEntrada(
    atendimentoId: string,
    filaId: string,
    versaoAtribuicao: number,
  ): void {
    if (
      !UUID.test(atendimentoId) ||
      !UUID.test(filaId) ||
      !Number.isInteger(versaoAtribuicao) ||
      versaoAtribuicao < 1
    ) {
      throw new ErroEntradaAtribuicaoAtendimentoInvalida();
    }
  }
}
