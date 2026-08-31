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
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  NOME_HEADER_CSRF_WEB,
  obterTokenCsrfWeb,
  obterTokenSessaoWeb,
  serializarCookiesSessaoWeb,
  serializarRemocaoCookiesSessaoWeb,
} from './cookies-sessao-web.js';
import { EntradaLoginWebDto } from './dto/entrada-login-web.dto.js';
import { SessaoWebDto } from './dto/sessao-web.dto.js';
import { ResumoSessaoWebDto } from './dto/resumo-sessao-web.dto.js';
import { ServicoAutenticacaoWeb } from './servico-autenticacao-web.js';
import { ServicoOrigemWeb } from './servico-origem-web.js';

interface RequisicaoHttp {
  readonly socket: { readonly remoteAddress?: string };
  get(nome: string): string | undefined;
}

interface RespostaHttp {
  append(nome: string, valor: string | readonly string[]): unknown;
}

@ApiTags('autenticacao')
@Controller('autenticacao/web')
export class ControladorAutenticacaoWeb {
  public constructor(
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoOrigemWeb)
    private readonly origens: ServicoOrigemWeb,
  ) {}

  @Post('entrar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaLoginWebDto })
  @ApiOperation({ operationId: 'entrarSessaoWeb', summary: 'Autentica e cria uma sessão web' })
  @ApiOkResponse({ type: SessaoWebDto })
  public async entrar(
    @Body() entrada: EntradaLoginWebDto,
    @Headers('origin') origem: string | undefined,
    @Req() requisicao: RequisicaoHttp,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<SessaoWebDto> {
    this.origens.validar(origem);
    const sessao = await this.autenticacao.entrar({
      agenteUsuario: requisicao.get('user-agent') ?? '',
      enderecoIp: requisicao.socket.remoteAddress ?? '',
      identificador: entrada.identificador,
      senha: entrada.senha,
      confirmarRevogacaoSessaoMaisAntiga:
        entrada.confirmar_revogacao_sessao_mais_antiga ?? false,
    });
    resposta.append('Set-Cookie', serializarCookiesSessaoWeb(sessao.token, sessao.csrf, sessao.expiraEm));
    return new SessaoWebDto(
      sessao.id,
      sessao.usuarioId,
      sessao.nomeExibicao,
      sessao.expiraEm,
    );
  }

  @Get('sessoes')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'listarSessoesWeb', summary: 'Lista as sessões web ativas do usuário atual' })
  @ApiOkResponse({ type: [ResumoSessaoWebDto] })
  public async listarSessoes(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<readonly ResumoSessaoWebDto[]> {
    const sessoes = await this.autenticacao.listarSessoes(
      obterTokenSessaoWeb(cookies),
    );
    return sessoes.map((sessao) => new ResumoSessaoWebDto(sessao));
  }

  @Get('sessao')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'obterSessaoWeb', summary: 'Obtém a sessão web atual' })
  @ApiOkResponse({ type: SessaoWebDto })
  public async obterSessao(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<SessaoWebDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new SessaoWebDto(
      sessao.contexto.sessaoId,
      sessao.contexto.usuarioId,
      sessao.nomeExibicao,
      sessao.contexto.expiraEm,
    );
  }

  @Post('rotacionar')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'rotacionarSessaoWeb', summary: 'Rotaciona os segredos da sessão web' })
  @ApiOkResponse({ type: SessaoWebDto })
  public async rotacionar(
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<SessaoWebDto> {
    this.origens.validar(origem);
    const token = obterTokenSessaoWeb(cookies);
    const csrf = obterTokenCsrfWeb(cookies, csrfCabecalho);
    const sessao = await this.autenticacao.rotacionar(token, csrf);
    resposta.append('Set-Cookie', serializarCookiesSessaoWeb(sessao.token, sessao.csrf, sessao.expiraEm));
    return new SessaoWebDto(
      sessao.id,
      sessao.usuarioId,
      sessao.nomeExibicao,
      sessao.expiraEm,
    );
  }

  @Post('sair')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'sairSessaoWeb', summary: 'Revoga a sessão web atual' })
  @ApiNoContentResponse()
  public async sair(
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<void> {
    this.origens.validar(origem);
    await this.autenticacao.sair(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
    );
    resposta.append('Set-Cookie', serializarRemocaoCookiesSessaoWeb());
  }

  @Post('sair-todas')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'sairTodasSessoesWeb', summary: 'Revoga todas as sessões web do usuário atual' })
  @ApiNoContentResponse()
  public async sairTodas(
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<void> {
    this.origens.validar(origem);
    await this.autenticacao.sairDeTodas(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
    );
    resposta.append('Set-Cookie', serializarRemocaoCookiesSessaoWeb());
  }

  @Post('sessoes/:sessaoId/revogar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'revogarSessaoWebDoUsuario', summary: 'Revoga uma sessão web pertencente ao usuário atual' })
  @ApiNoContentResponse()
  public async revogarSessao(
    @Param('sessaoId', new ParseUUIDPipe()) sessaoId: string,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<void> {
    this.origens.validar(origem);
    await this.autenticacao.revogarSessaoDoUsuario(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      sessaoId,
    );
  }

  @Post('usuarios/:usuarioId/revogar-sessoes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'revogarSessoesWebAdministrativamente', summary: 'Revoga administrativamente as sessões web de um usuário' })
  @ApiNoContentResponse()
  public async revogarSessoesAdministrativamente(
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<void> {
    this.origens.validar(origem);
    await this.autenticacao.revogarSessoesAdministrativamente(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      usuarioId,
    );
  }

  @Post('usuarios/:usuarioId/revogar-dispositivos-mobile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'revogarDispositivosMobileAdministrativamente', summary: 'Revoga administrativamente os dispositivos móveis de um usuário' })
  @ApiNoContentResponse()
  public async revogarDispositivosMobileAdministrativamente(
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<void> {
    this.origens.validar(origem);
    await this.autenticacao.revogarDispositivosMobileAdministrativamente(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      usuarioId,
    );
  }
}
