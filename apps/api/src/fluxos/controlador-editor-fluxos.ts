import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  NOME_HEADER_CSRF_WEB,
  obterTokenCsrfWeb,
  obterTokenSessaoWeb,
} from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import {
  EntradaCriacaoFluxoEditorDto,
  EntradaNovaVersaoFluxoEditorDto,
  EntradaRevisaoFluxoDto,
  EntradaRevisaoVersaoFluxoDto,
  EntradaSalvarRascunhoFluxoDto,
  EntradaSimulacaoFluxoDto,
  FluxoCriadoEditorDto,
  FluxoEditorDto,
  ResultadoPreparacaoFluxoDto,
  ResultadoPublicacaoFluxoDto,
  ResultadoSimulacaoFluxoDto,
  VersaoFluxoEditorDto,
} from './dto/editor-fluxos.dto.js';
import { ServicoEditorFluxos } from './servico-editor-fluxos.js';

interface SessaoWebPersistida {
  readonly id: string;
  readonly usuarioId: string;
  readonly expiraEm: Date;
}

@ApiTags('motor-de-fluxos')
@ApiCookieAuth('sessaoWeb')
@Controller('administracao/fluxos')
export class ControladorEditorFluxos {
  public constructor(
    @Inject(ServicoEditorFluxos)
    private readonly editor: ServicoEditorFluxos,
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoOrigemWeb)
    private readonly origens: ServicoOrigemWeb,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listarFluxosEditor',
    summary: 'Lista fluxos e versões autorizados para o editor visual',
  })
  @ApiOkResponse({ type: [FluxoEditorDto] })
  public async listar(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<readonly FluxoEditorDto[]> {
    const sessao = await this.autenticacao.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    const fluxos = await this.prisma.executarLeituraConsistente((transacao) =>
      this.editor.listar(sessao.contexto, transacao),
    );
    return fluxos.map((fluxo) => new FluxoEditorDto(fluxo));
  }

  @Post('simular')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'simularFluxoEditor',
    summary: 'Simula uma definição somente com dados e efeitos fictícios',
  })
  @ApiBody({ type: EntradaSimulacaoFluxoDto })
  @ApiOkResponse({ type: ResultadoSimulacaoFluxoDto })
  public async simular(
    @Body() entrada: EntradaSimulacaoFluxoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<ResultadoSimulacaoFluxoDto> {
    this.origens.validar(origem);
    const resultado = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) =>
        this.editor.simular(
          this.contexto(sessao),
          entrada.definicao,
          entrada.cenario,
          transacao,
        ),
    );
    return new ResultadoSimulacaoFluxoDto(resultado);
  }

  @Get(':fluxoId')
  @ApiOperation({
    operationId: 'obterFluxoEditor',
    summary: 'Obtém um fluxo e suas versões para edição autorizada',
  })
  @ApiOkResponse({ type: FluxoEditorDto })
  public async obter(
    @Param('fluxoId', new ParseUUIDPipe()) fluxoId: string,
    @Headers('cookie') cookies: string | undefined,
  ): Promise<FluxoEditorDto> {
    const sessao = await this.autenticacao.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    const fluxo = await this.prisma.executarLeituraConsistente((transacao) =>
      this.editor.obter(sessao.contexto, fluxoId, transacao),
    );
    return new FluxoEditorDto(fluxo);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'criarFluxoEditor',
    summary: 'Cria um fluxo com rascunho tipado inicial',
  })
  @ApiBody({ type: EntradaCriacaoFluxoEditorDto })
  @ApiCreatedResponse({ type: FluxoCriadoEditorDto })
  public async criar(
    @Body() entrada: EntradaCriacaoFluxoEditorDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<FluxoCriadoEditorDto> {
    this.origens.validar(origem);
    return this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      async (sessao, _agora, transacao) => {
        const criado = await this.editor.criar(
          this.contexto(sessao),
          {
            definicaoInicial: entrada.definicao,
            ...(entrada.descricao === undefined
              ? {}
              : { descricao: entrada.descricao }),
            nome: entrada.nome,
            tipo: entrada.tipo,
            versaoSchemaDefinicao: 1,
          },
          transacao,
        );
        return new FluxoCriadoEditorDto(criado.fluxo, criado.versao);
      },
    );
  }

  @Post(':fluxoId/versoes')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'criarVersaoFluxoEditor',
    summary: 'Cria nova versão rascunho sem alterar a versão publicada',
  })
  @ApiBody({ type: EntradaNovaVersaoFluxoEditorDto })
  @ApiCreatedResponse({ type: VersaoFluxoEditorDto })
  public async criarVersao(
    @Param('fluxoId', new ParseUUIDPipe()) fluxoId: string,
    @Body() entrada: EntradaNovaVersaoFluxoEditorDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<VersaoFluxoEditorDto> {
    this.origens.validar(origem);
    const versao = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) =>
        this.editor.criarVersao(
          this.contexto(sessao),
          {
            definicao: entrada.definicao,
            fluxoId,
            versaoSchemaDefinicao: entrada.versao_schema_definicao,
          },
          transacao,
        ),
    );
    return new VersaoFluxoEditorDto(versao);
  }

  @Put(':fluxoId/versoes/:versaoFluxoId/rascunho')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'salvarRascunhoFluxoEditor',
    summary: 'Salva somente a versão rascunho sob revisão otimista',
  })
  @ApiBody({ type: EntradaSalvarRascunhoFluxoDto })
  @ApiOkResponse({ type: VersaoFluxoEditorDto })
  public async salvarRascunho(
    @Param('fluxoId', new ParseUUIDPipe()) fluxoId: string,
    @Param('versaoFluxoId', new ParseUUIDPipe()) versaoFluxoId: string,
    @Body() entrada: EntradaSalvarRascunhoFluxoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<VersaoFluxoEditorDto> {
    this.origens.validar(origem);
    const versao = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) =>
        this.editor.salvarRascunho(
          this.contexto(sessao),
          {
            definicao: entrada.definicao,
            fluxoId,
            revisaoEsperada: entrada.revisao_esperada,
            versaoFluxoId,
            versaoSchemaDefinicao: entrada.versao_schema_definicao,
          },
          transacao,
        ),
    );
    return new VersaoFluxoEditorDto(versao);
  }

  @Post(':fluxoId/versoes/:versaoFluxoId/preparar-publicacao')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'prepararPublicacaoFluxoEditor',
    summary: 'Valida integralmente e promove o rascunho para teste',
  })
  @ApiBody({ type: EntradaRevisaoVersaoFluxoDto })
  @ApiOkResponse({ type: ResultadoPreparacaoFluxoDto })
  public async prepararPublicacao(
    @Param('fluxoId', new ParseUUIDPipe()) fluxoId: string,
    @Param('versaoFluxoId', new ParseUUIDPipe()) versaoFluxoId: string,
    @Body() entrada: EntradaRevisaoVersaoFluxoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<ResultadoPreparacaoFluxoDto> {
    this.origens.validar(origem);
    const resultado = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) =>
        this.editor.prepararParaPublicacao(
          this.contexto(sessao),
          fluxoId,
          {
            revisaoVersaoEsperada: entrada.revisao_esperada,
            versaoFluxoId,
          },
          transacao,
        ),
    );
    return new ResultadoPreparacaoFluxoDto(resultado);
  }

  @Post(':fluxoId/versoes/:versaoFluxoId/publicar')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({
    operationId: 'publicarVersaoFluxoEditor',
    summary: 'Publica explicitamente uma versão já validada',
  })
  @ApiBody({ type: EntradaRevisaoFluxoDto })
  @ApiOkResponse({ type: ResultadoPublicacaoFluxoDto })
  public async publicar(
    @Param('fluxoId', new ParseUUIDPipe()) fluxoId: string,
    @Param('versaoFluxoId', new ParseUUIDPipe()) versaoFluxoId: string,
    @Body() entrada: EntradaRevisaoFluxoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<ResultadoPublicacaoFluxoDto> {
    this.origens.validar(origem);
    const resultado = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) =>
        this.editor.publicar(
          this.contexto(sessao),
          {
            fluxoId,
            revisaoFluxoEsperada: entrada.revisao_fluxo_esperada,
            versaoFluxoId,
          },
          transacao,
        ),
    );
    return new ResultadoPublicacaoFluxoDto(resultado);
  }

  private contexto(sessao: SessaoWebPersistida): ContextoSessaoAutorizacao {
    return {
      estado: 'ATIVA',
      expiraEm: sessao.expiraEm,
      sessaoId: sessao.id,
      usuarioId: sessao.usuarioId,
    };
  }
}
