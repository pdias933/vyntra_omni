import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ErroCanonicoDto } from '../sistema/dto/erro-canonico.dto.js';
import { EstadoSaudeDto } from './dto/estado-saude.dto.js';
import { ServicoProntidao } from './servico-prontidao.js';

@ApiTags('saude')
@Controller('saude')
export class ControladorSaude {
  public constructor(
    @Inject(ServicoProntidao)
    private readonly prontidao: ServicoProntidao,
  ) {}

  @Get('vivo')
  @ApiOperation({
    operationId: 'verificarProcessoVivo',
    summary: 'Informa se o processo da API está vivo.',
  })
  @ApiOkResponse({ type: EstadoSaudeDto })
  public vivo(): EstadoSaudeDto {
    return new EstadoSaudeDto('VIVO');
  }

  @Get('pronto')
  @ApiOperation({
    operationId: 'verificarAplicacaoPronta',
    summary: 'Informa se a API pode receber tráfego.',
  })
  @ApiOkResponse({ type: EstadoSaudeDto })
  @ApiServiceUnavailableResponse({ type: ErroCanonicoDto })
  public async pronto(): Promise<EstadoSaudeDto> {
    const resultado = await this.prontidao.verificar();

    if (!resultado.pronto) {
      throw new ExcecaoHttpCanonica(
        503,
        'SERVICO_NAO_PRONTO',
        'O serviço ainda não está pronto para receber solicitações.',
      );
    }

    return new EstadoSaudeDto('PRONTO');
  }
}
