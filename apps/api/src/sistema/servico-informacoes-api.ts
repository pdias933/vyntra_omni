import { Injectable } from '@nestjs/common';

import { InformacoesApiDto } from './dto/informacoes-api.dto.js';

@Injectable()
export class ServicoInformacoesApi {
  public obter(): InformacoesApiDto {
    return new InformacoesApiDto('Vyntra Omnichannel', 'v1');
  }
}
