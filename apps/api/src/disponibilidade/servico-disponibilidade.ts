import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroConflitoDisponibilidade, ErroDisponibilidadeInvalida, ErroUsuarioDisponibilidadeIndisponivel } from './erros-disponibilidade.js';
import type { DisponibilidadeUsuarioPersistida, EstadoDisponibilidadeUsuario } from './modelo-disponibilidade.js';
import { REPOSITORIO_DISPONIBILIDADE, type RepositorioDisponibilidade } from './repositorio-disponibilidade.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoDisponibilidade {
  public constructor(
    @Inject(REPOSITORIO_DISPONIBILIDADE) private readonly repositorio: RepositorioDisponibilidade,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria) private readonly auditoria: ServicoAuditoria,
  ) {}

  public async definir(
    sessao: ContextoSessaoAutorizacao,
    usuarioId: string,
    estado: EstadoDisponibilidadeUsuario,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<DisponibilidadeUsuarioPersistida> {
    if (!UUID.test(usuarioId) || !['DISPONIVEL', 'INDISPONIVEL'].includes(estado) || !Number.isInteger(versaoEsperada) || versaoEsperada < 0) {
      throw new ErroDisponibilidadeInvalida();
    }
    const propria = usuarioId === sessao.usuarioId;
    await this.autorizacao.autorizar(
      {
        permissao: propria ? 'ALTERAR_DISPONIBILIDADE_PROPRIA' : 'ALTERAR_DISPONIBILIDADE_USUARIO',
        recurso: { id: usuarioId, tipo: 'DISPONIBILIDADE_USUARIO' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
    await this.repositorio.bloquearUsuario(usuarioId, transacao);
    if (!(await this.repositorio.usuarioEstaAtivo(usuarioId, transacao))) {
      throw new ErroUsuarioDisponibilidadeIndisponivel();
    }
    const atual = await this.repositorio.obter(usuarioId, transacao);
    if ((atual?.versao ?? 0) !== versaoEsperada) throw new ErroConflitoDisponibilidade();
    if (atual?.estado === estado) return atual;
    const agora = relogio();
    if (Number.isNaN(agora.getTime())) throw new ErroDisponibilidadeInvalida();
    const proxima: DisponibilidadeUsuarioPersistida = {
      alteradoEm: agora,
      alteradoPorUsuarioId: sessao.usuarioId,
      estado,
      usuarioId,
      versao: versaoEsperada + 1,
    };
    const alterou = atual === undefined
      ? await this.repositorio.criar(proxima, transacao)
      : await this.repositorio.alterar(proxima, versaoEsperada, transacao);
    if (!alterou) throw new ErroConflitoDisponibilidade();
    await this.auditoria.registrar(
      {
        acao: 'ALTERAR_DISPONIBILIDADE_USUARIO',
        dadosAnteriores: { estado: atual?.estado ?? 'AUSENTE', versao: versaoEsperada },
        dadosNovos: { estado, versao: proxima.versao },
        entidadeId: usuarioId,
        entidadeTipo: 'DISPONIBILIDADE_USUARIO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'DISPONIBILIDADE_USUARIO_ALTERADA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return proxima;
  }
}

