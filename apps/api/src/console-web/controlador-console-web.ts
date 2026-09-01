import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ListaAtendimentosWebDto } from './dto/console-web.dto.js';
import { FILTROS_ATENDIMENTOS_WEB, type FiltroAtendimentosWeb } from './modelo-console-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';

@ApiTags('console-web')
@Controller('web')
export class ControladorConsoleWeb {
  public constructor(
    @Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoListaAtendimentosWeb) private readonly atendimentos: ServicoListaAtendimentosWeb,
  ) {}

  @Get('atendimentos')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ enum: FILTROS_ATENDIMENTOS_WEB, name: 'filtro', required: false })
  @ApiOperation({ operationId: 'listarAtendimentosWeb', summary: 'Lista atendimentos autorizados para o console web' })
  @ApiOkResponse({ type: ListaAtendimentosWebDto })
  public async listarAtendimentos(
    @Headers('cookie') cookies: string | undefined,
    @Query('filtro') filtroRecebido?: string,
  ): Promise<ListaAtendimentosWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    const filtro = this.validarFiltro(filtroRecebido);
    return new ListaAtendimentosWebDto(
      filtro,
      await this.atendimentos.listar(sessao.contexto, filtro),
    );
  }

  private validarFiltro(filtro: string | undefined): FiltroAtendimentosWeb {
    if (filtro === undefined) return 'MEUS';
    const encontrado = FILTROS_ATENDIMENTOS_WEB.find((item) => item === filtro);
    if (encontrado === undefined) {
      throw new ExcecaoHttpCanonica(400, 'FILTRO_ATENDIMENTOS_INVALIDO', 'O filtro informado é inválido.');
    }
    return encontrado;
  }
}
