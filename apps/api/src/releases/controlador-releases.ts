import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  NOME_HEADER_DISPOSITIVO_MOBILE,
  NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE,
} from '../autenticacao/controlador-autenticacao-mobile.js';
import {
  NOME_HEADER_CSRF_WEB,
  obterTokenCsrfWeb,
  obterTokenSessaoWeb,
} from '../autenticacao/cookies-sessao-web.js';
import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import { ServicoAutenticacaoMobile } from '../autenticacao/servico-autenticacao-mobile.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import type { PlataformaMobile } from '../autenticacao/modelo-autenticacao-mobile.js';
import {
  AdministracaoReleasesDto,
  AvaliacaoPoliticaVersaoMobileDto,
  ConfiguracaoClienteMobileDto,
  ConfiguracaoClienteWebDto,
  ControleRecursoDto,
  EntradaAvaliacaoVersaoMobileDto,
  EntradaAtualizacaoControleRecursoDto,
  EntradaAtualizacaoPoliticaVersaoMobileDto,
  PoliticaVersaoMobileDto,
} from './dto/releases.dto.js';
import { ErroConfiguracaoReleaseInvalida } from './erros-releases.js';
import { ServicoReleases } from './servico-releases.js';

const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;

function obterTokenAcesso(autorizacao: string | undefined): string {
  const correspondencia = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(
    autorizacao ?? '',
  );
  if (correspondencia?.[1] === undefined) throw new ErroNaoAutenticado();
  return correspondencia[1];
}

function exigirSegredo(valor: string | undefined): string {
  if (valor === undefined || !SEGREDO_OPACO.test(valor)) {
    throw new ErroNaoAutenticado();
  }
  return valor;
}

@ApiTags('configuracao')
@Controller()
export class ControladorReleases {
  public constructor(
    @Inject(ServicoReleases)
    private readonly releases: ServicoReleases,
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacaoWeb: ServicoAutenticacaoWeb,
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacaoMobile: ServicoAutenticacaoMobile,
    @Inject(ServicoOrigemWeb)
    private readonly origens: ServicoOrigemWeb,
  ) {}

  @Post('configuracao/mobile/avaliar')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: EntradaAvaliacaoVersaoMobileDto })
  @ApiOperation({
    operationId: 'avaliarVersaoMobile',
    summary: 'Avalia a política pública de versão antes da autenticação',
  })
  @ApiOkResponse({ type: AvaliacaoPoliticaVersaoMobileDto })
  public async avaliarVersaoMobile(
    @Body() entrada: EntradaAvaliacaoVersaoMobileDto,
  ): Promise<AvaliacaoPoliticaVersaoMobileDto> {
    return new AvaliacaoPoliticaVersaoMobileDto(
      await this.releases.avaliarPoliticaVersao(
        entrada.plataforma,
        entrada.versao_aplicativo,
      ),
    );
  }

  @Post('configuracao/mobile/atual')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
  @ApiBody({ type: EntradaAvaliacaoVersaoMobileDto })
  @ApiOperation({
    operationId: 'obterConfiguracaoMobileAtual',
    summary: 'Obtém política e controles efetivos do usuário mobile',
  })
  @ApiOkResponse({ type: ConfiguracaoClienteMobileDto })
  public async obterConfiguracaoMobile(
    @Body() entrada: EntradaAvaliacaoVersaoMobileDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE)
    dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE)
    segredo: string | undefined,
  ): Promise<ConfiguracaoClienteMobileDto> {
    const sessao = await this.autenticacaoMobile.autenticar(
      obterTokenAcesso(autorizacao),
      dispositivoId ?? '',
      exigirSegredo(segredo),
    );
    return new ConfiguracaoClienteMobileDto(
      await this.releases.obterConfiguracaoMobile(
        sessao.contexto.usuarioId,
        entrada.plataforma,
        entrada.versao_aplicativo,
      ),
    );
  }

  @Get('configuracao/web/atual')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({
    operationId: 'obterConfiguracaoWebAtual',
    summary: 'Obtém controles efetivos do usuário web',
  })
  @ApiOkResponse({ type: ConfiguracaoClienteWebDto })
  public async obterConfiguracaoWeb(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<ConfiguracaoClienteWebDto> {
    const sessao = await this.autenticacaoWeb.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    return new ConfiguracaoClienteWebDto(
      await this.releases.obterControlesUsuario(sessao.contexto.usuarioId),
    );
  }

  @Get('administracao/releases')
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({
    operationId: 'listarAdministracaoReleases',
    summary: 'Lista controles e políticas mediante autorização administrativa',
  })
  @ApiOkResponse({ type: AdministracaoReleasesDto })
  public async listarAdministracao(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<AdministracaoReleasesDto> {
    const sessao = await this.autenticacaoWeb.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    return new AdministracaoReleasesDto(
      await this.releases.listarAdministracao(sessao.contexto),
    );
  }

  @Put('administracao/releases/controles-recurso/:codigo')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaAtualizacaoControleRecursoDto })
  @ApiOperation({
    operationId: 'atualizarControleRecurso',
    summary: 'Cria ou altera rollout e desligamento emergencial',
  })
  @ApiOkResponse({ type: ControleRecursoDto })
  public async atualizarControle(
    @Param('codigo') codigo: string,
    @Body() entrada: EntradaAtualizacaoControleRecursoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<ControleRecursoDto> {
    this.origens.validar(origem);
    const controle = await this.autenticacaoWeb.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      async (sessao, _agora, transacao) =>
        this.releases.atualizarControle(
          {
            estado: 'ATIVA',
            expiraEm: sessao.expiraEm,
            sessaoId: sessao.id,
            usuarioId: sessao.usuarioId,
          },
          {
            codigo,
            desligadoEmergencialmente: entrada.desligado_emergencialmente,
            estado: entrada.estado,
            filasAlvo: entrada.filas_alvo,
            liberarAdministradores: entrada.liberar_administradores,
            percentualLiberacao: entrada.percentual_liberacao,
            usuariosAlvo: entrada.usuarios_alvo,
            versaoEsperada: entrada.versao_esperada,
          },
          transacao,
        ),
    );
    return new ControleRecursoDto(controle);
  }

  @Put('administracao/releases/politicas-mobile/:plataforma')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaAtualizacaoPoliticaVersaoMobileDto })
  @ApiOperation({
    operationId: 'atualizarPoliticaVersaoMobile',
    summary: 'Atualiza versões mínima e recomendada de uma plataforma',
  })
  @ApiOkResponse({ type: PoliticaVersaoMobileDto })
  public async atualizarPolitica(
    @Param('plataforma') plataformaRecebida: string,
    @Body() entrada: EntradaAtualizacaoPoliticaVersaoMobileDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<PoliticaVersaoMobileDto> {
    this.origens.validar(origem);
    const plataforma = this.normalizarPlataforma(plataformaRecebida);
    const politica = await this.autenticacaoWeb.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      async (sessao, _agora, transacao) =>
        this.releases.atualizarPolitica(
          {
            estado: 'ATIVA',
            expiraEm: sessao.expiraEm,
            sessaoId: sessao.id,
            usuarioId: sessao.usuarioId,
          },
          {
            plataforma,
            versaoEsperada: entrada.versao_esperada,
            versaoMinima: entrada.versao_minima,
            versaoRecomendada: entrada.versao_recomendada,
            ...(entrada.mensagem === undefined
              ? {}
              : { mensagem: entrada.mensagem }),
            ...(entrada.url_loja === undefined
              ? {}
              : { urlLoja: entrada.url_loja }),
          },
          transacao,
        ),
    );
    return new PoliticaVersaoMobileDto(politica);
  }

  private normalizarPlataforma(valor: string): PlataformaMobile {
    if (valor === 'IOS' || valor === 'ANDROID') return valor;
    throw new ErroConfiguracaoReleaseInvalida();
  }
}
