import { Global, Module, type DynamicModule } from '@nestjs/common';

import { CONSULTAS_ERP, type ConsultasErp } from './adaptador-erp.js';
import { AdaptadorConsultasMkSolutions } from './adaptadores/mk-solutions/adaptador-consultas-mk-solutions.js';
import { carregarConfiguracaoMkSolutions } from './adaptadores/mk-solutions/configuracao-mk-solutions.js';

@Global()
@Module({})
export class ModuloConsultasErp {
  public static registrar(): DynamicModule {
    return {
      exports: [CONSULTAS_ERP],
      global: true,
      module: ModuloConsultasErp,
      providers: [
        {
          provide: CONSULTAS_ERP,
          useFactory: async (): Promise<ConsultasErp | undefined> => {
            const configuracao = await carregarConfiguracaoMkSolutions();
            return configuracao === undefined
              ? undefined
              : new AdaptadorConsultasMkSolutions(configuracao);
          },
        },
      ],
    };
  }
}
