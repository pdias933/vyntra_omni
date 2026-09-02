import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { loggerEstruturado } from './logger-estruturado.js';
import { ServicoObservabilidade } from './servico-observabilidade.js';

const INTERVALO_MONITOR_MS = 60_000;

@Injectable()
export class MonitorAlertasOperacionais
  implements OnModuleInit, OnModuleDestroy
{
  private agendamento?: NodeJS.Timeout;
  private ativos = new Set<string>();

  public constructor(
    @Inject(ServicoObservabilidade)
    private readonly observabilidade: ServicoObservabilidade,
  ) {}

  public onModuleInit(): void {
    if (process.env.MONITOR_ALERTAS_DESATIVADO === 'true') return;
    this.agendamento = setInterval(
      () => void this.avaliar(),
      INTERVALO_MONITOR_MS,
    );
    this.agendamento.unref();
  }

  public onModuleDestroy(): void {
    if (this.agendamento !== undefined) clearInterval(this.agendamento);
  }

  public async avaliar(): Promise<void> {
    try {
      const painel = await this.observabilidade.coletarInternamente();
      const atuais = new Set(
        painel.alertas.map((alerta) => `${alerta.codigo}:${alerta.componente}`),
      );
      for (const alerta of painel.alertas) {
        const chave = `${alerta.codigo}:${alerta.componente}`;
        if (this.ativos.has(chave)) continue;
        loggerEstruturado.registrar('warn', 'ALERTA_OPERACIONAL_ATIVO', {
          codigo_erro: alerta.codigo,
          componente: alerta.componente,
          operacao: alerta.runbook,
        });
      }
      for (const chave of this.ativos) {
        if (atuais.has(chave)) continue;
        const [codigo, componente] = chave.split(':');
        loggerEstruturado.registrar('info', 'ALERTA_OPERACIONAL_RESOLVIDO', {
          codigo_erro: codigo,
          componente,
        });
      }
      this.ativos = atuais;
    } catch {
      loggerEstruturado.registrar('error', 'MONITOR_OPERACIONAL_FALHOU', {
        codigo_erro: 'COLETA_OBSERVABILIDADE_FALHOU',
        componente: 'OBSERVABILIDADE',
      });
    }
  }
}
