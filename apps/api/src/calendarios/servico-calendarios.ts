import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { AvaliadorCalendario } from './avaliador-calendario.js';
import {
  ErroCalendarioAusente,
  ErroCalendarioInvalido,
  ErroConflitoOverrideCalendario,
} from './erros-calendario.js';
import type {
  OverrideCalendarioPersistido,
  ResultadoCalendario,
} from './modelo-calendario.js';
import {
  REPOSITORIO_CALENDARIOS,
  type RepositorioCalendarios,
} from './repositorio-calendarios.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoCalendarios {
  private readonly avaliador = new AvaliadorCalendario();

  public constructor(
    @Inject(REPOSITORIO_CALENDARIOS)
    private readonly repositorio: RepositorioCalendarios,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async avaliar(
    calendarioId: string,
    instante: Date,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoCalendario> {
    if (!UUID.test(calendarioId)) throw new ErroCalendarioInvalido();
    const calendario = await this.repositorio.obter(calendarioId, transacao);
    if (calendario === undefined) throw new ErroCalendarioAusente();
    return this.avaliador.avaliar(calendario, instante);
  }

  public async definirOverride(
    sessao: ContextoSessaoAutorizacao,
    calendarioId: string,
    estado: 'ABERTO' | 'FECHADO',
    motivoInformado: string,
    vigenteDe: Date,
    vigenteAte: Date,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<OverrideCalendarioPersistido> {
    const motivo = motivoInformado.trim();
    if (
      !UUID.test(calendarioId) ||
      !['ABERTO', 'FECHADO'].includes(estado) ||
      motivo.length < 1 ||
      motivo.length > 500 ||
      Number.isNaN(vigenteDe.getTime()) ||
      Number.isNaN(vigenteAte.getTime()) ||
      vigenteDe >= vigenteAte
    ) {
      throw new ErroCalendarioInvalido();
    }
    await this.repositorio.bloquear(calendarioId, transacao);
    const calendario = await this.repositorio.obter(calendarioId, transacao);
    if (calendario === undefined) throw new ErroCalendarioAusente();
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_CALENDARIOS',
        recurso: { id: calendarioId, tipo: 'CALENDARIO_ATENDIMENTO' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
    if (
      await this.repositorio.existeOverrideSobreposto(
        calendarioId,
        vigenteDe,
        vigenteAte,
        transacao,
      )
    ) {
      throw new ErroConflitoOverrideCalendario();
    }
    const criadoEm = relogio();
    if (Number.isNaN(criadoEm.getTime())) throw new ErroCalendarioInvalido();
    const override: OverrideCalendarioPersistido = {
      calendarioId,
      criadoEm,
      estado,
      executadoPorUsuarioId: sessao.usuarioId,
      id: randomUUID(),
      motivo,
      vigenteAte,
      vigenteDe,
    };
    await this.repositorio.criarOverride(override, transacao);
    await this.auditoria.registrar(
      {
        acao: 'DEFINIR_OVERRIDE_CALENDARIO',
        dadosNovos: { estado, vigenteAte, vigenteDe },
        entidadeId: calendarioId,
        entidadeTipo: 'CALENDARIO_ATENDIMENTO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'OVERRIDE_CALENDARIO_DEFINIDO',
        usuarioId: sessao.usuarioId,
        ...(calendario.filaId === undefined
          ? {}
          : { filaId: calendario.filaId }),
      },
      transacao,
    );
    return override;
  }
}
