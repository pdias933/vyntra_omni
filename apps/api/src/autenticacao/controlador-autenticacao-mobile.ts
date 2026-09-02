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
import { ResumoDispositivoMobileDto } from './dto/resumo-dispositivo-mobile.dto.js';
import {
  EntradaComprovantePareamentoQrDto,
  EntradaResgatePareamentoQrDto,
  EstadoPareamentoQrMobileDto,
  ResgatePareamentoQrDto,
} from './dto/pareamento-qr.dto.js';
import { ServicoAutenticacaoMobile } from './servico-autenticacao-mobile.js';
import { ServicoPareamentoQr } from './servico-pareamento-qr.js';

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
    @Inject(ServicoPareamentoQr)
    private readonly pareamentoQr: ServicoPareamentoQr,
  ) {}

  @Post('pareamentos-qr/resgatar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaResgatePareamentoQrDto })
  @ApiOperation({ operationId: 'resgatarPareamentoQrMobile', summary: 'Resgata uma vez o token efêmero de pareamento QR' })
  @ApiOkResponse({ type: ResgatePareamentoQrDto })
  public async resgatarPareamentoQr(
    @Body() entrada: EntradaResgatePareamentoQrDto,
    @Req() requisicao: RequisicaoHttpMobile,
  ): Promise<ResgatePareamentoQrDto> {
    const resgate = await this.pareamentoQr.resgatar(
      entrada.token_qr,
      {
        identificadorInstalacao: entrada.identificador_instalacao,
        ...(entrada.modelo_sanitizado === undefined
          ? {}
          : { modeloSanitizado: entrada.modelo_sanitizado }),
        plataforma: entrada.plataforma,
        segredoVinculo: entrada.segredo_vinculo,
        versaoAplicativo: entrada.versao_aplicativo,
      },
      requisicao.socket.remoteAddress ?? '',
    );
    return new ResgatePareamentoQrDto(resgate);
  }

  @Post('pareamentos-qr/consultar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaComprovantePareamentoQrDto })
  @ApiOperation({ operationId: 'consultarPareamentoQrMobile', summary: 'Consulta a confirmação web do pareamento resgatado' })
  @ApiOkResponse({ type: EstadoPareamentoQrMobileDto })
  public async consultarPareamentoQr(
    @Body() entrada: EntradaComprovantePareamentoQrDto,
  ): Promise<EstadoPareamentoQrMobileDto> {
    const estado = await this.pareamentoQr.consultarNoMobile(
      entrada.pareamento_id,
      entrada.comprovante_resgate,
      {
        identificadorInstalacao: entrada.identificador_instalacao,
        ...(entrada.modelo_sanitizado === undefined
          ? {}
          : { modeloSanitizado: entrada.modelo_sanitizado }),
        plataforma: entrada.plataforma,
        segredoVinculo: entrada.segredo_vinculo,
        versaoAplicativo: entrada.versao_aplicativo,
      },
    );
    return new EstadoPareamentoQrMobileDto(estado);
  }

  @Post('pareamentos-qr/concluir')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaComprovantePareamentoQrDto })
  @ApiOperation({ operationId: 'concluirPareamentoQrMobile', summary: 'Conclui o pareamento confirmado e entrega sessão somente ao mobile' })
  @ApiOkResponse({ type: SessaoMobileDto })
  public async concluirPareamentoQr(
    @Body() entrada: EntradaComprovantePareamentoQrDto,
  ): Promise<SessaoMobileDto> {
    const sessao = await this.pareamentoQr.concluir(
      entrada.pareamento_id,
      entrada.comprovante_resgate,
      {
        identificadorInstalacao: entrada.identificador_instalacao,
        ...(entrada.modelo_sanitizado === undefined
          ? {}
          : { modeloSanitizado: entrada.modelo_sanitizado }),
        plataforma: entrada.plataforma,
        segredoVinculo: entrada.segredo_vinculo,
        versaoAplicativo: entrada.versao_aplicativo,
      },
    );
    return new SessaoMobileDto(sessao);
  }

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
      ...(entrada.codigo_mfa === undefined
        ? {}
        : { codigoMfa: entrada.codigo_mfa }),
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

  @Get('dispositivos')
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiOperation({ operationId: 'listarDispositivosMobile', summary: 'Lista os dispositivos móveis ativos do usuário atual' })
  @ApiOkResponse({ type: [ResumoDispositivoMobileDto] })
  public async listarDispositivos(
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<readonly ResumoDispositivoMobileDto[]> {
    const dispositivos = await this.autenticacao.listarDispositivos(
      obterTokenAcesso(autorizacao),
      exigirCabecalho(dispositivoId),
      exigirCabecalho(segredo),
    );
    return dispositivos.map(
      (dispositivo) => new ResumoDispositivoMobileDto(dispositivo),
    );
  }

  @Post('dispositivos/:dispositivoId/revogar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiOperation({ operationId: 'revogarDispositivoMobileDoUsuario', summary: 'Revoga um dispositivo móvel do usuário atual' })
  @ApiNoContentResponse()
  public async revogarDispositivo(
    @Param('dispositivoId', new ParseUUIDPipe()) dispositivoAlvoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<void> {
    await this.autenticacao.revogarDispositivoDoUsuario(
      obterTokenAcesso(autorizacao),
      exigirCabecalho(dispositivoId),
      exigirCabecalho(segredo),
      dispositivoAlvoId,
    );
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
