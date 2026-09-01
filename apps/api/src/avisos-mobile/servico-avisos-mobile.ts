import { Inject, Injectable } from '@nestjs/common';

import type { PayloadEventoPush } from '../sincronizacao/modelo-projecao-evento.js';
import { CompositorAvisoMobile } from './compositor-aviso-mobile.js';
import type { ResultadoEntregaAvisoMobile } from './modelo-aviso-mobile.js';
import {
  PORTA_ENTREGA_AVISO_MOBILE,
  type PortaEntregaAvisoMobile,
} from './porta-entrega-aviso-mobile.js';

@Injectable()
export class ServicoAvisosMobile {
  public constructor(
    @Inject(PORTA_ENTREGA_AVISO_MOBILE)
    private readonly entrega: PortaEntregaAvisoMobile,
    @Inject(CompositorAvisoMobile)
    private readonly compositor: CompositorAvisoMobile,
  ) {}

  public async avisar(
    destinatarioDispositivoId: string,
    eventoConfirmado: PayloadEventoPush,
  ): Promise<ResultadoEntregaAvisoMobile> {
    const aviso = this.compositor.compor(
      destinatarioDispositivoId,
      eventoConfirmado,
    );
    const resultado = await this.entrega.entregar(aviso);
    if (
      resultado.estado === 'ACEITO' &&
      !/^[A-Za-z0-9._:-]{1,160}$/u.test(resultado.identificadorEntrega)
    ) {
      throw new Error('RESULTADO_ENTREGA_AVISO_MOBILE_INVALIDO');
    }
    if (
      resultado.estado !== 'ACEITO' &&
      resultado.estado !== 'DESTINO_INVALIDO' &&
      resultado.estado !== 'INDISPONIVEL'
    ) {
      throw new Error('RESULTADO_ENTREGA_AVISO_MOBILE_DESCONHECIDO');
    }
    return resultado;
  }
}
