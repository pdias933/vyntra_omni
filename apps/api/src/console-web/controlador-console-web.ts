import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { EntradaLeituraTimelineWebDto, EntradaMarcarNaoLidaWebDto, ListaAtendimentosWebDto, MarcadorLeituraWebDto, PaginaTimelineWebDto } from './dto/console-web.dto.js';
import { FILTROS_ATENDIMENTOS_WEB, type FiltroAtendimentosWeb } from './modelo-console-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';
import { ServicoTimelineWeb } from './servico-timeline-web.js';

@ApiTags('console-web')
@Controller('web')
export class ControladorConsoleWeb {
  public constructor(
    @Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoListaAtendimentosWeb) private readonly atendimentos: ServicoListaAtendimentosWeb,
    @Inject(ServicoTimelineWeb) private readonly timeline: ServicoTimelineWeb,
    @Inject(ServicoOrigemWeb) private readonly origens: ServicoOrigemWeb,
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

  @Get('atendimentos/:atendimentoId/timeline')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({ operationId: 'obterTimelineWeb', summary: 'Obtém uma página autorizada da timeline única do contato' })
  @ApiOkResponse({ type: PaginaTimelineWebDto })
  public async obterTimeline(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('cookie') cookies: string | undefined,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaTimelineWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new PaginaTimelineWebDto(await this.timeline.obter(sessao.contexto, atendimentoId, cursor));
  }

  @Post('atendimentos/:atendimentoId/leitura')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaLeituraTimelineWebDto })
  @ApiOperation({ operationId: 'confirmarLeituraTimelineWeb', summary: 'Avança o marcador pessoal de leitura' })
  @ApiOkResponse({ type: MarcadorLeituraWebDto })
  public async confirmarLeitura(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaLeituraTimelineWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MarcadorLeituraWebDto> {
    this.origens.validar(origem);
    const versao = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) => this.timeline.marcarLida(
        { estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId },
        atendimentoId,
        entrada.mensagem_id,
        entrada.versao_esperada,
        transacao,
      ),
    );
    return new MarcadorLeituraWebDto(versao);
  }

  @Post('atendimentos/:atendimentoId/marcar-nao-lida')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaMarcarNaoLidaWebDto })
  @ApiOperation({ operationId: 'marcarTimelineWebNaoLida', summary: 'Marca a conversa como não lida para o usuário atual' })
  @ApiOkResponse({ type: MarcadorLeituraWebDto })
  public async marcarNaoLida(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaMarcarNaoLidaWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MarcadorLeituraWebDto> {
    this.origens.validar(origem);
    const versao = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) => this.timeline.marcarNaoLida(
        { estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId },
        atendimentoId,
        entrada.versao_esperada,
        transacao,
      ),
    );
    return new MarcadorLeituraWebDto(versao);
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
