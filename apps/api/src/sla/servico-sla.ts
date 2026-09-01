import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAtendimentoSemObrigacaoHumana,
  ErroEntradaSlaInvalida,
  ErroObrigacaoHumanaInexistente,
  ErroPoliticaSlaAusente,
} from './erros-sla.js';
import type {
  AlertaSlaEmitido,
  NivelAlertaSla,
  PoliticaSlaPersistida,
  RelogioSlaPersistido,
} from './modelo-sla.js';
import { REPOSITORIO_SLA, type RepositorioSla } from './repositorio-sla.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MILISSEGUNDOS_POR_MINUTO = 60_000;

@Injectable()
export class ServicoSla {
  public constructor(
    @Inject(REPOSITORIO_SLA) private readonly repositorio: RepositorioSla,
    @Inject(ServicoEventoDominio) private readonly eventos: ServicoEventoDominio,
  ) {}

  public async iniciarObrigacaoHumana(
    atendimentoId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<RelogioSlaPersistido> {
    this.validarIdentificador(atendimentoId);
    await this.repositorio.bloquearAtendimento(atendimentoId, transacao);
    const ativo = await this.repositorio.obterRelogioAtivo(atendimentoId, transacao);
    if (ativo !== undefined) return ativo;

    const contexto = await this.repositorio.obterContextoObrigacaoHumana(
      atendimentoId,
      transacao,
    );
    if (contexto === 'SEM_POLITICA') throw new ErroPoliticaSlaAusente();
    if (contexto === undefined) throw new ErroAtendimentoSemObrigacaoHumana();
    this.validarPolitica(contexto.politica);

    const agora = relogio();
    this.validarInstante(agora);
    const novo: RelogioSlaPersistido = {
      alertaAdministradorEm: this.somarMinutos(
        agora,
        contexto.politica.alertaAdministradorAposMinutos,
      ),
      alertaAtendenteEm: this.somarMinutos(
        agora,
        contexto.politica.alertaAtendenteAposMinutos,
      ),
      alertaSupervisorEm: this.somarMinutos(
        agora,
        contexto.politica.alertaSupervisorAposMinutos,
      ),
      atendimentoId,
      id: randomUUID(),
      numeroCiclo: await this.repositorio.proximoNumeroCiclo(
        atendimentoId,
        transacao,
      ),
      obrigacaoHumanaEm: agora,
      politicaSlaId: contexto.politica.id,
      versao: 1,
    };
    await this.repositorio.criarRelogio(novo, transacao);
    await this.eventos.acrescentar(
      {
        atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: contexto.conversaId,
        dados: {
          filaId: contexto.filaId,
          numeroCiclo: novo.numeroCiclo,
          politicaSlaId: novo.politicaSlaId,
          politicaSlaVersao: contexto.politica.versao,
        },
        entidadeId: novo.id,
        entidadeTipo: 'RELOGIO_SLA',
        tipo: 'SLA_OBRIGACAO_HUMANA_INICIADA',
      },
      transacao,
    );
    return novo;
  }

  public async avaliarEscalonamento(
    atendimentoId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<readonly AlertaSlaEmitido[]> {
    this.validarIdentificador(atendimentoId);
    await this.repositorio.bloquearAtendimento(atendimentoId, transacao);
    const ativo = await this.repositorio.obterRelogioAtivo(atendimentoId, transacao);
    if (ativo === undefined) throw new ErroObrigacaoHumanaInexistente();
    const agora = relogio();
    this.validarInstante(agora);
    const vencimentos: readonly [NivelAlertaSla, Date][] = [
      ['ATENDENTE', ativo.alertaAtendenteEm],
      ['SUPERVISOR', ativo.alertaSupervisorEm],
      ['ADMINISTRADOR', ativo.alertaAdministradorEm],
    ];
    const emitidos: AlertaSlaEmitido[] = [];
    for (const [nivel, previstoEm] of vencimentos) {
      if (agora < previstoEm) continue;
      const alerta: AlertaSlaEmitido = {
        emitidoEm: agora,
        id: randomUUID(),
        nivel,
        previstoEm,
        relogioSlaId: ativo.id,
      };
      if (!(await this.repositorio.registrarAlerta(alerta, transacao))) continue;
      emitidos.push(alerta);
      await this.eventos.acrescentar(
        {
          atendimentoId,
          classificacaoDados: 'OPERACIONAL',
          dados: { nivel, numeroCiclo: ativo.numeroCiclo },
          entidadeId: alerta.id,
          entidadeTipo: 'ALERTA_SLA',
          tipo: `SLA_ALERTA_${nivel}_EMITIDO`,
        },
        transacao,
      );
    }
    return emitidos;
  }

  public async concluirObrigacaoHumana(
    atendimentoId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<boolean> {
    this.validarIdentificador(atendimentoId);
    await this.repositorio.bloquearAtendimento(atendimentoId, transacao);
    const ativo = await this.repositorio.obterRelogioAtivo(atendimentoId, transacao);
    if (ativo === undefined) return false;
    const agora = relogio();
    this.validarInstante(agora);
    if (agora < ativo.obrigacaoHumanaEm) throw new ErroEntradaSlaInvalida();
    const concluiu = await this.repositorio.concluirRelogio(
      ativo.id,
      agora,
      ativo.versao,
      transacao,
    );
    if (!concluiu) return false;
    await this.eventos.acrescentar(
      {
        atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        dados: { numeroCiclo: ativo.numeroCiclo },
        entidadeId: ativo.id,
        entidadeTipo: 'RELOGIO_SLA',
        tipo: 'SLA_OBRIGACAO_HUMANA_CONCLUIDA',
      },
      transacao,
    );
    return true;
  }

  private validarIdentificador(atendimentoId: string): void {
    if (!UUID.test(atendimentoId)) throw new ErroEntradaSlaInvalida();
  }

  private validarInstante(instante: Date): void {
    if (!Number.isFinite(instante.getTime())) throw new ErroEntradaSlaInvalida();
  }

  private validarPolitica(politica: PoliticaSlaPersistida): void {
    const { alertaAtendenteAposMinutos: atendente,
      alertaSupervisorAposMinutos: supervisor,
      alertaAdministradorAposMinutos: administrador } = politica;
    if (
      !Number.isInteger(atendente) || !Number.isInteger(supervisor) ||
      !Number.isInteger(administrador) || atendente < 0 ||
      atendente >= supervisor || supervisor >= administrador
    ) throw new ErroEntradaSlaInvalida();
  }

  private somarMinutos(instante: Date, minutos: number): Date {
    const resultado = new Date(instante.getTime() + minutos * MILISSEGUNDOS_POR_MINUTO);
    this.validarInstante(resultado);
    return resultado;
  }
}
