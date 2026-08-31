import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ErroCanonicoDto } from './dto/erro-canonico.dto.js';
import { InformacoesApiDto } from './dto/informacoes-api.dto.js';
import { ServicoInformacoesApi } from './servico-informacoes-api.js';

@ApiTags('sistema')
@ApiExtraModels(ErroCanonicoDto)
@Controller()
export class ControladorInformacoesApi {
  public constructor(
    @Inject(ServicoInformacoesApi)
    private readonly servico: ServicoInformacoesApi,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'obterInformacoesApi',
    summary: 'Obtém a identidade e a versão pública da API.',
  })
  @ApiOkResponse({ type: InformacoesApiDto })
  @ApiInternalServerErrorResponse({ type: ErroCanonicoDto })
  public obter(): InformacoesApiDto {
    return this.servico.obter();
  }
}
