import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ErroTextoLivreForaJanela } from '../janela-canal/erros-janela-canal.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { DetalhesContatoWebDto, EntradaAlterarContextoWebDto, EntradaEnvioModeloWebDto, EntradaEnvioTextoWebDto, EntradaExecutarAcaoErpWebDto, EntradaLeituraTimelineWebDto, EntradaMarcarNaoLidaWebDto, EntradaPrepararAcaoErpWebDto, EntradaReacaoWebDto, ListaAtendimentosWebDto, MarcadorLeituraWebDto, MensagemCriadaWebDto, ModeloAprovadoWebDto, PaginaBuscaConversaWebDto, PaginaGaleriaConversaWebDto, PaginaTimelineWebDto, PreviaAcaoErpWebDto, RespostaRapidaWebDto, ResultadoAcaoErpWebDto, ResultadoFinanceiroContatoWebDto } from './dto/console-web.dto.js';
import { FILTROS_ATENDIMENTOS_WEB, type FiltroAtendimentosWeb, type TipoGaleriaWeb } from './modelo-console-web.js';
import { ServicoBuscaGaleriaWeb } from './servico-busca-galeria-web.js';
import { ServicoContatoAcoesWeb } from './servico-contato-acoes-web.js';
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
    @Inject(ServicoBuscaGaleriaWeb) private readonly buscaGaleria: ServicoBuscaGaleriaWeb,
    @Inject(ServicoContatoAcoesWeb) private readonly contatoAcoes: ServicoContatoAcoesWeb,
  ) {}

  @Get('atendimentos/:atendimentoId/contato')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'obterDetalhesContatoWeb', summary: 'Obtém identidade, contexto e dados autorizados do contato' })
  @ApiOkResponse({ type: DetalhesContatoWebDto })
  public async obterDetalhesContato(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('cookie') cookies: string | undefined,
  ): Promise<DetalhesContatoWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new DetalhesContatoWebDto(await this.contatoAcoes.obterDetalhes(sessao.contexto, atendimentoId));
  }

  @Post('atendimentos/:atendimentoId/contexto')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaAlterarContextoWebDto })
  @ApiOperation({ operationId: 'alterarContextoContatoWeb', summary: 'Troca cliente e contrato ativos com concorrência otimista' })
  @ApiOkResponse({ type: DetalhesContatoWebDto })
  public async alterarContextoContato(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaAlterarContextoWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<DetalhesContatoWebDto> {
    const sessao = await this.executarEscrita(cookies, csrfCabecalho, origem, async (contextoSessao, transacao) => {
      await this.contatoAcoes.alterarContexto(contextoSessao, atendimentoId, {
        versaoEsperada: entrada.versao_esperada,
        vinculoClienteId: entrada.vinculo_cliente_id,
        ...(entrada.vinculo_contrato_id === undefined ? {} : { vinculoContratoId: entrada.vinculo_contrato_id }),
      }, transacao);
      return contextoSessao;
    });
    return new DetalhesContatoWebDto(await this.contatoAcoes.obterDetalhes(sessao, atendimentoId));
  }

  @Get('atendimentos/:atendimentoId/financeiro')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'consultarFinanceiroContatoWeb', summary: 'Consulta situação financeira em tempo real, sem snapshot decisório' })
  @ApiOkResponse({ type: ResultadoFinanceiroContatoWebDto })
  public async consultarFinanceiroContato(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('cookie') cookies: string | undefined,
  ): Promise<ResultadoFinanceiroContatoWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new ResultadoFinanceiroContatoWebDto(await this.contatoAcoes.consultarFinanceiro(sessao.contexto, atendimentoId));
  }

  @Post('atendimentos/:atendimentoId/acoes-erp/preparar')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaPrepararAcaoErpWebDto })
  @ApiOperation({ operationId: 'prepararAcaoErpContatoWeb', summary: 'Revalida o contexto e prepara uma ação sensível para confirmação' })
  @ApiOkResponse({ type: PreviaAcaoErpWebDto })
  public async prepararAcaoErpContato(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaPrepararAcaoErpWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<PreviaAcaoErpWebDto> {
    const sessao = await this.autenticarEscrita(cookies, csrfCabecalho, origem);
    return new PreviaAcaoErpWebDto(await this.contatoAcoes.prepararAcao(sessao, atendimentoId, entrada.acao));
  }

  @Post('atendimentos/:atendimentoId/acoes-erp/executar')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaExecutarAcaoErpWebDto })
  @ApiOperation({ operationId: 'executarAcaoErpContatoWeb', summary: 'Executa a ação confirmada por serviço idempotente de domínio' })
  @ApiOkResponse({ type: ResultadoAcaoErpWebDto })
  public async executarAcaoErpContato(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaExecutarAcaoErpWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<ResultadoAcaoErpWebDto> {
    const sessao = await this.autenticarEscrita(cookies, csrfCabecalho, origem);
    return new ResultadoAcaoErpWebDto(await this.contatoAcoes.executarAcao(sessao, atendimentoId, {
      acao: entrada.acao,
      chaveIdempotencia: entrada.chave_idempotencia,
      confirmacaoExplicita: true,
      ...(entrada.assunto === undefined ? {} : { assunto: entrada.assunto }),
      ...(entrada.descricao === undefined ? {} : { descricao: entrada.descricao }),
    }));
  }

  @Get('atendimentos/:atendimentoId/busca')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ name: 'termo', required: true })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({ operationId: 'buscarConversaWeb', summary: 'Pesquisa conteúdo autorizado da conversa no PostgreSQL' })
  @ApiOkResponse({ type: PaginaBuscaConversaWebDto })
  public async buscarConversa(@Param('atendimentoId') atendimentoId: string, @Headers('cookie') cookies: string | undefined, @Query('termo') termo = '', @Query('cursor') cursor?: string): Promise<PaginaBuscaConversaWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new PaginaBuscaConversaWebDto(await this.buscaGaleria.buscar(sessao.contexto, atendimentoId, termo, cursor));
  }

  @Get('atendimentos/:atendimentoId/galeria')
  @ApiCookieAuth('sessaoWeb')
  @ApiQuery({ enum: ['MIDIAS', 'LINKS', 'DOCUMENTOS'], name: 'tipo', required: true })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({ operationId: 'listarGaleriaConversaWeb', summary: 'Lista mídia, links ou documentos autorizados no PostgreSQL' })
  @ApiOkResponse({ type: PaginaGaleriaConversaWebDto })
  public async listarGaleria(@Param('atendimentoId') atendimentoId: string, @Headers('cookie') cookies: string | undefined, @Query('tipo') tipoRecebido = '', @Query('cursor') cursor?: string): Promise<PaginaGaleriaConversaWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    const tipo = ['MIDIAS', 'LINKS', 'DOCUMENTOS'].find((item) => item === tipoRecebido) as TipoGaleriaWeb | undefined;
    if (tipo === undefined) throw new ExcecaoHttpCanonica(400, 'TIPO_GALERIA_INVALIDO', 'O filtro informado é inválido.');
    return new PaginaGaleriaConversaWebDto(await this.buscaGaleria.listarGaleria(sessao.contexto, atendimentoId, tipo, cursor));
  }

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
        this.composer.enviarTexto(sessao, atendimentoId, {
          mensagemClienteId: entrada.mensagem_cliente_id,
          ...(entrada.responde_a_mensagem_id === undefined ? {} : { respondeAMensagemId: entrada.responde_a_mensagem_id }),
          texto: entrada.texto,
        }, transacao)));
    } catch (erro) {
      if (erro instanceof ErroTextoLivreForaJanela) {
        throw new ExcecaoHttpCanonica(409, 'JANELA_META_EXPIRADA', 'A janela de conversa expirou. Use uma mensagem aprovada.');
      }
      throw erro;
    }
  }

  @Post('atendimentos/:atendimentoId/mensagens/midia')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['arquivo', 'mensagem_cliente_id'], properties: { arquivo: { type: 'string', format: 'binary' }, mensagem_cliente_id: { type: 'string', format: 'uuid' } } } })
  @ApiOperation({ operationId: 'enviarMidiaWeb', summary: 'Valida e enfileira mídia em storage privado' })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 64 * 1024 * 1024, files: 1 } }))
  public async enviarMidia(
    @Param('atendimentoId') atendimentoId: string,
    @UploadedFile() arquivo: { readonly buffer: Buffer; readonly mimetype: string; readonly originalname: string } | undefined,
    @Body('mensagem_cliente_id') mensagemClienteId: string | undefined,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    if (arquivo === undefined || mensagemClienteId === undefined) throw new ExcecaoHttpCanonica(400, 'MIDIA_INVALIDA', 'Selecione um arquivo permitido.');
    return new MensagemCriadaWebDto(await this.executarEscrita(cookies, csrfCabecalho, origem, (sessao, transacao) =>
      this.composer.enviarMidia(sessao, atendimentoId, {
        conteudo: arquivo.buffer,
        mensagemClienteId,
        mime: arquivo.mimetype,
        nomeArquivo: arquivo.originalname,
      }, transacao)));
  }

  @Post('atendimentos/:atendimentoId/mensagens/reacao')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaReacaoWebDto })
  @ApiOperation({ operationId: 'reagirMensagemWeb', summary: 'Registra reação com fallback conforme capacidade do canal' })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  public async reagir(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaReacaoWebDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    return new MensagemCriadaWebDto(await this.executarEscrita(cookies, csrfCabecalho, origem, (sessao, transacao) =>
      this.composer.reagir(sessao, atendimentoId, {
        emoji: entrada.emoji,
        mensagemAlvoId: entrada.mensagem_alvo_id,
        mensagemClienteId: entrada.mensagem_cliente_id,
      }, transacao)));
  }

  @Get('midias/:mensagemId/conteudo')
  @ApiCookieAuth('sessaoWeb')
  @ApiProduces('application/octet-stream')
  @ApiOperation({ operationId: 'baixarMidiaWeb', summary: 'Entrega mídia privada após autorização atual' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  public async baixarMidia(
    @Param('mensagemId') mensagemId: string,
    @Headers('cookie') cookies: string | undefined,
    @Res({ passthrough: true }) resposta: { setHeader(nome: string, valor: string): void },
  ): Promise<StreamableFile> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    const conteudo = await this.composer.baixarMidia(sessao.contexto, mensagemId);
    resposta.setHeader('Content-Type', conteudo.mime);
    resposta.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(conteudo.nomeArquivo)}`);
    resposta.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(conteudo.bytes);
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

  private async autenticarEscrita(
    cookies: string | undefined,
    csrfCabecalho: string | undefined,
    origem: string | undefined,
  ): Promise<ContextoSessaoAutorizacao> {
    this.origens.validar(origem);
    return this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      async (sessao) => ({ estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId }),
    );
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
