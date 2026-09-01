import { randomUUID } from 'node:crypto';

import type { AvisoMobile, ResultadoEntregaAvisoMobile } from '../../modelo-aviso-mobile.js';
import type { PortaEntregaAvisoMobile } from '../../porta-entrega-aviso-mobile.js';

export class AdaptadorPushSimulado implements PortaEntregaAvisoMobile {
  private disponivel = true;
  private readonly agrupados = new Map<string, AvisoMobile>();

  public definirDisponibilidade(disponivel: boolean): void {
    this.disponivel = disponivel;
  }

  public async entregar(
    aviso: AvisoMobile,
  ): Promise<ResultadoEntregaAvisoMobile> {
    if (!this.disponivel) return { estado: 'INDISPONIVEL' };
    const chave = `${aviso.destinatarioDispositivoId}:${aviso.chaveAgrupamento}`;
    this.agrupados.set(chave, aviso);
    return {
      estado: 'ACEITO',
      identificadorEntrega: `simulado:${randomUUID()}`,
    };
  }

  public listarAgrupados(): readonly AvisoMobile[] {
    return [...this.agrupados.values()];
  }
}
