import type {
  AvisoMobile,
  ResultadoEntregaAvisoMobile,
} from './modelo-aviso-mobile.js';

export const PORTA_ENTREGA_AVISO_MOBILE = Symbol(
  'PORTA_ENTREGA_AVISO_MOBILE',
);

export interface PortaEntregaAvisoMobile {
  entregar(aviso: AvisoMobile): Promise<ResultadoEntregaAvisoMobile>;
}
