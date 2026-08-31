import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import { EntradaLoginMobileDto } from './dto/entrada-login-mobile.dto.js';
import { EntradaRefreshMobileDto } from './dto/entrada-refresh-mobile.dto.js';
import {
  ContextoSessaoMobileDto,
  SessaoMobileDto,
} from './dto/sessao-mobile.dto.js';
import { ServicoAutenticacaoMobile } from './servico-autenticacao-mobile.js';

export const NOME_HEADER_DISPOSITIVO_MOBILE = 'x-dispositivo-id';
export const NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE = 'x-segredo-dispositivo';

interface RequisicaoHttpMobile {
  readonly socket: { readonly remoteAddress?: string };
}

function obterTokenAcesso(autorizacao: string | undefined): string {
  const correspondencia = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(
    autorizacao ?? '',
  );
  if (correspondencia?.[1] === undefined) throw new ErroNaoAutenticado();
  return correspondencia[1];
}

function exigirCabecalho(valor: string | undefined): string {
  if (valor === undefined || valor.length === 0) throw new ErroNaoAutenticado();
  return valor;
}

@ApiTags('autenticacao')
@Controller('autenticacao/mobile')
export class ControladorAutenticacaoMobile {
  public constructor(
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacao: ServicoAutenticacaoMobile,
  ) {}

  @Post('entrar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaLoginMobileDto })
  @ApiOperation({ operationId: 'entrarSessaoMobile', summary: 'Autentica e vincula uma sessão mobile ao aparelho' })
  @ApiOkResponse({ type: SessaoMobileDto })
  public async entrar(
    @Body() entrada: EntradaLoginMobileDto,
    @Req() requisicao: RequisicaoHttpMobile,
  ): Promise<SessaoMobileDto> {
    const sessao = await this.autenticacao.entrar({
      enderecoIp: requisicao.socket.remoteAddress ?? '',
      identificador: entrada.identificador,
      identificadorInstalacao: entrada.identificador_instalacao,
      ...(entrada.modelo_sanitizado === undefined
        ? {}
        : { modeloSanitizado: entrada.modelo_sanitizado }),
      plataforma: entrada.plataforma,
      segredoVinculo: entrada.segredo_vinculo,
      senha: entrada.senha,
      versaoAplicativo: entrada.versao_aplicativo,
    });
    return new SessaoMobileDto(sessao);
  }

  @Post('renovar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaRefreshMobileDto })
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiOperation({ operationId: 'renovarSessaoMobile', summary: 'Rotaciona access e refresh tokens mobile' })
  @ApiOkResponse({ type: SessaoMobileDto })
  public async renovar(
    @Body() entrada: EntradaRefreshMobileDto,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<SessaoMobileDto> {
    const sessao = await this.autenticacao.renovar(
      entrada.token_refresh,
      exigirCabecalho(dispositivoId),
      exigirCabecalho(segredo),
    );
    return new SessaoMobileDto(sessao);
  }

  @Get('sessao')
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiOperation({ operationId: 'obterSessaoMobile', summary: 'Valida a sessão mobile atual' })
  @ApiOkResponse({ type: ContextoSessaoMobileDto })
  public async obterSessao(
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<ContextoSessaoMobileDto> {
    const sessao = await this.autenticacao.autenticar(
      obterTokenAcesso(autorizacao),
      exigirCabecalho(dispositivoId),
      exigirCabecalho(segredo),
    );
    return new ContextoSessaoMobileDto(sessao);
  }

  @Post('sair')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiOperation({ operationId: 'sairSessaoMobile', summary: 'Revoga a sessão mobile atual' })
  @ApiNoContentResponse()
  public async sair(
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<void> {
    await this.autenticacao.sair(
      obterTokenAcesso(autorizacao),
      exigirCabecalho(dispositivoId),
      exigirCabecalho(segredo),
    );
  }
}
