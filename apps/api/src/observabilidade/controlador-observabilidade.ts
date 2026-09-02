import { Controller, Get, Headers, Inject } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { PainelObservabilidadeDto } from './dto-observabilidade.js';
import { ServicoObservabilidade } from './servico-observabilidade.js';

@ApiTags('observabilidade')
@ApiCookieAuth('sessaoWeb')
@Controller('administracao/observabilidade')
export class ControladorObservabilidade {
  public constructor(
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoObservabilidade)
    private readonly observabilidade: ServicoObservabilidade,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'observarOperacao',
    summary: 'Expõe métricas e alertas agregados sem dados protegidos',
  })
  @ApiOkResponse({ type: PainelObservabilidadeDto })
  public async observar(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<PainelObservabilidadeDto> {
    const sessao = await this.autenticacao.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    return new PainelObservabilidadeDto(
      await this.observabilidade.observar(sessao.contexto),
    );
  }
}
