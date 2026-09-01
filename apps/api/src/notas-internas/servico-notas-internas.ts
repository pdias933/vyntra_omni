import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroNotaInternaInvalida } from './erros-nota-interna.js';
import type { NotaInternaPersistida } from './modelo-nota-interna.js';
import {
  REPOSITORIO_NOTAS_INTERNAS,
  type RepositorioNotasInternas,
} from './repositorio-notas-internas.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoNotasInternas {
  public constructor(
    @Inject(REPOSITORIO_NOTAS_INTERNAS)
    private readonly repositorio: RepositorioNotasInternas,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async adicionar(
    sessao: ContextoSessaoAutorizacao,
    conversaId: string,
    atendimentoId: string,
    filaId: string,
    texto: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<NotaInternaPersistida> {
    const textoNormalizado = this.validarEntrada(
      conversaId,
      atendimentoId,
      filaId,
      texto,
    );
    await this.autorizacao.autorizar(
      {
        filaId,
        permissao: 'ADICIONAR_NOTA_INTERNA',
        recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => ({
        acessivel: await this.repositorio.contextoPermiteNota(
          conversaId,
          atendimentoId,
          filaId,
          transacao,
        ),
        estadoPermiteAcao: true,
      }),
      transacao,
    );
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroNotaInternaInvalida();
    const nota: NotaInternaPersistida = {
      atendimentoId,
      autorUsuarioId: sessao.usuarioId,
      conteudoProtegido: { texto: textoNormalizado },
      conversaId,
      criadaEm: agora,
      id: randomUUID(),
      visibilidade: 'SOMENTE_EQUIPE',
    };
    await this.repositorio.acrescentar(nota, transacao);
    await this.eventos.acrescentar(
      {
        atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId,
        dados: { filaId, visibilidade: 'SOMENTE_EQUIPE' },
        entidadeId: nota.id,
        entidadeTipo: 'NOTA_INTERNA',
        tipo: 'NOTA_INTERNA_ADICIONADA',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.auditoria.registrar(
      {
        acao: 'ADICIONAR_NOTA_INTERNA',
        atendimentoId,
        dadosNovos: { visibilidade: 'SOMENTE_EQUIPE' },
        entidadeId: nota.id,
        entidadeTipo: 'NOTA_INTERNA',
        filaId,
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'NOTA_INTERNA_ADICIONADA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return nota;
  }

  private validarEntrada(
    conversaId: string,
    atendimentoId: string,
    filaId: string,
    texto: unknown,
  ): string {
    if (
      !UUID.test(conversaId) ||
      !UUID.test(atendimentoId) ||
      !UUID.test(filaId) ||
      typeof texto !== 'string' ||
      texto.includes('\u0000')
    ) {
      throw new ErroNotaInternaInvalida();
    }
    const normalizado = texto.trim();
    if (normalizado.length < 1 || normalizado.length > 4_000) {
      throw new ErroNotaInternaInvalida();
    }
    return normalizado;
  }
}
