import { Injectable } from '@nestjs/common';

import type { ResultadoLinkTranscricaoDesativado } from './modelo-acoes-atendimento-erp.js';

@Injectable()
export class PoliticaLinkTranscricaoPublica {
  public avaliar(): ResultadoLinkTranscricaoDesativado {
    return {
      motivo: 'APROVACAO_JURIDICA_PENDENTE',
      situacao: 'DESATIVADO',
    };
  }
}
