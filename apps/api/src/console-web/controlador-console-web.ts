import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ErroTextoLivreForaJanela } from '../janela-canal/erros-janela-canal.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { EntradaEnvioModeloWebDto, EntradaEnvioTextoWebDto, EntradaLeituraTimelineWebDto, EntradaMarcarNaoLidaWebDto, ListaAtendimentosWebDto, MarcadorLeituraWebDto, MensagemCriadaWebDto, ModeloAprovadoWebDto, PaginaTimelineWebDto, RespostaRapidaWebDto } from './dto/console-web.dto.js';
import { FILTROS_ATENDIMENTOS_WEB, type FiltroAtendimentosWeb } from './modelo-console-web.js';
import { ServicoListaAtendimentosWeb } from './servico-lista-atendimentos-web.js';
import { ServicoTimelineWeb } from './servico-timeline-web.js';
import { ServicoComposerWeb } from './servico-composer-web.js';

@ApiTags('console-web')
@Controller('web')
export class ControladorConsoleWeb {
  public constructor(
    @Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoListaAtendimentosWeb) private readonly atendimentos: ServicoListaAtendimentosWeb,
    @Inject(ServicoTimelineWeb) private readonly timeline: ServicoTimelineWeb,
    @Inject(ServicoOrigemWeb) private readonly origens: ServicoOrigemWeb,
    @Inject(ServicoComposerWeb) private readonly composer: ServicoComposerWeb,
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

  @Get('atendimentos/:atendimentoId/respostas-rapidas')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ name: 'busca', required: false })
  @ApiOperation({ operationId: 'listarRespostasRapidasWeb', summary: 'Pesquisa respostas rápidas autorizadas para o atendimento' })
  @ApiOkResponse({ type: [RespostaRapidaWebDto] })
  public async listarRespostasRapidas(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('cookie') cookies: string | undefined,
    @Query('busca') busca?: string,
  ): Promise<readonly RespostaRapidaWebDto[]> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    const itens = await this.composer.listarRespostasRapidas(sessao.contexto, atendimentoId, busca);
    return itens.map((item) => new RespostaRapidaWebDto(item));
  }

  @Get('atendimentos/:atendimentoId/modelos-aprovados')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ name: 'busca', required: false })
  @ApiOperation({ operationId: 'listarModelosAprovadosWeb', summary: 'Pesquisa mensagens aprovadas para iniciar contato' })
  @ApiOkResponse({ type: [ModeloAprovadoWebDto] })
  public async listarModelos(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('cookie') cookies: string | undefined,
    @Query('busca') busca?: string,
  ): Promise<readonly ModeloAprovadoWebDto[]> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    const itens = await this.composer.listarModelos(sessao.contexto, atendimentoId, busca);
    return itens.map((item) => new ModeloAprovadoWebDto(item));
  }

  @Post('atendimentos/:atendimentoId/mensagens/texto')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaEnvioTextoWebDto })
  @ApiOperation({ operationId: 'enviarTextoWeb', summary: 'Enfileira texto livre autorizado' })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  public async enviarTexto(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaEnvioTextoWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    try {
      return new MensagemCriadaWebDto(await this.executarEscrita(cookies, csrfCabecalho, origem, (sessao, transacao) =>
        this.composer.enviarTexto(sessao, atendimentoId, { mensagemClienteId: entrada.mensagem_cliente_id, texto: entrada.texto }, transacao)));
    } catch (erro) {
      if (erro instanceof ErroTextoLivreForaJanela) {
        throw new ExcecaoHttpCanonica(409, 'JANELA_META_EXPIRADA', 'A janela de conversa expirou. Use uma mensagem aprovada.');
      }
      throw erro;
    }
  }

  @Post('atendimentos/:atendimentoId/mensagens/modelo')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaEnvioModeloWebDto })
  @ApiOperation({ operationId: 'enviarModeloAprovadoWeb', summary: 'Enfileira mensagem aprovada autorizada' })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  public async enviarModelo(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaEnvioModeloWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    return new MensagemCriadaWebDto(await this.executarEscrita(cookies, csrfCabecalho, origem, (sessao, transacao) =>
      this.composer.enviarModelo(sessao, atendimentoId, {
        mensagemClienteId: entrada.mensagem_cliente_id,
        modeloId: entrada.modelo_id,
        parametros: entrada.parametros,
      }, transacao)));
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

  private async executarEscrita<Resultado>(
    cookies: string | undefined,
    csrfCabecalho: string | undefined,
    origem: string | undefined,
    operacao: (sessao: { readonly estado: 'ATIVA'; readonly expiraEm: Date; readonly sessaoId: string; readonly usuarioId: string }, transacao: TransacaoPrisma) => Promise<Resultado>,
  ): Promise<Resultado> {
    this.origens.validar(origem);
    return this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) => operacao(
        { estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId },
        transacao,
      ),
    );
  }
}
