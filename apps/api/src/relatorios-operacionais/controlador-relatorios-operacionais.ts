import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { RelatorioOperacionalDto } from './dto-relatorios-operacionais.js';
import { PERIODOS_RELATORIO, type PeriodoRelatorio } from './modelo-relatorios-operacionais.js';
import { ServicoRelatoriosOperacionais } from './servico-relatorios-operacionais.js';

@ApiTags('relatorios-operacionais')
@ApiCookieAuth('sessaoWeb')
@Controller('administracao/relatorios-operacionais')
export class ControladorRelatoriosOperacionais {
  public constructor(
    @Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoRelatoriosOperacionais) private readonly relatorios: ServicoRelatoriosOperacionais,
  ) {}

  @Get()
  @ApiQuery({ enum: PERIODOS_RELATORIO, name: 'periodo', required: false })
  @ApiOperation({ operationId: 'obterRelatorioOperacional', summary: 'Agrega indicadores somente das filas autorizadas' })
  @ApiOkResponse({ type: RelatorioOperacionalDto })
  public async obter(@Headers('cookie') cookies: string | undefined, @Query('periodo') recebido = '24H'): Promise<RelatorioOperacionalDto> {
    const periodo = PERIODOS_RELATORIO.find((item) => item === recebido) as PeriodoRelatorio | undefined;
    if (periodo === undefined) throw new ExcecaoHttpCanonica(400, 'PERIODO_RELATORIO_INVALIDO', 'O período informado é inválido.');
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new RelatorioOperacionalDto(await this.relatorios.obter(sessao.contexto, periodo));
  }
}
