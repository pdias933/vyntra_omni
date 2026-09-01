import { Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { DefinicaoFluxo } from './modelo-fluxo.js';
import type { ContextoValidacaoPublicacaoFluxo } from './modelo-validacao-fluxo.js';
import type { ProvedorContextoValidacaoFluxo } from './provedor-contexto-validacao-fluxo.js';

@Injectable()
export class ProvedorContextoValidacaoFluxoConservador
  implements ProvedorContextoValidacaoFluxo
{
  public obter(
    _definicao: DefinicaoFluxo,
    _transacao: TransacaoPrisma,
  ): Promise<ContextoValidacaoPublicacaoFluxo> {
    return Promise.resolve({
      capacidadesHabilitadas: [
        'ENVIAR_MENSAGEM',
        'ENVIAR_BOTOES_OU_LISTA',
      ],
      referenciasAtivas: [],
    });
  }
}
