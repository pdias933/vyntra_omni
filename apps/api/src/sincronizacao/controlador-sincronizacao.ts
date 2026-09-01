import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import {
  NOME_HEADER_DISPOSITIVO_MOBILE,
  NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE,
} from '../autenticacao/controlador-autenticacao-mobile.js';
import { obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoMobile } from '../autenticacao/servico-autenticacao-mobile.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import {
  LoteSincronizacaoDto,
  SnapshotSincronizacaoDto,
} from './dto/sincronizacao.dto.js';
import {
  ErroCursorSincronizacaoInvalido,
  ErroRessincronizacaoCompletaNecessaria,
} from './erros-sincronizacao.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';
import { ServicoRessincronizacaoCompleta } from './servico-ressincronizacao-completa.js';

function obterTokenAcesso(cabecalho: string): string {
  const resultado = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(cabecalho);
  if (resultado?.[1] === undefined) throw new ErroNaoAutenticado();
  return resultado[1];
}

@ApiTags('sincronizacao')
@Controller('sincronizacao')
export class ControladorSincronizacao {
  public constructor(
    @Inject(ServicoSincronizacaoIncremental)
    private readonly sincronizacao: ServicoSincronizacaoIncremental,
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacaoWeb: ServicoAutenticacaoWeb,
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacaoMobile: ServicoAutenticacaoMobile,
    @Inject(ServicoRessincronizacaoCompleta)
    private readonly ressincronizacao: ServicoRessincronizacaoCompleta,
  ) {}

  @Get('completa')
  @ApiCookieAuth('sessaoWeb')
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: false })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: false })
  @ApiOperation({ operationId: 'ressincronizarCompleta', summary: 'Reconstrói a réplica autorizada em leitura consistente' })
  @ApiOkResponse({ type: SnapshotSincronizacaoDto })
  public async ressincronizarCompleta(
    @Headers('authorization') autorizacao: string | undefined,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredoDispositivo: string | undefined,
  ): Promise<SnapshotSincronizacaoDto> {
    if (autorizacao !== undefined) {
      if (dispositivoId === undefined || segredoDispositivo === undefined) {
        throw new ErroNaoAutenticado();
      }
      const sessao = await this.autenticacaoMobile.autenticar(
        obterTokenAcesso(autorizacao),
        dispositivoId,
        segredoDispositivo,
      );
      return new SnapshotSincronizacaoDto(
        await this.ressincronizacao.reconstruir(sessao.contexto),
      );
    }
    const sessao = await this.autenticacaoWeb.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    return new SnapshotSincronizacaoDto(
      await this.ressincronizacao.reconstruir(sessao.contexto),
    );
  }

  @Get()
  @ApiCookieAuth('sessaoWeb')
  @ApiBearerAuth('sessaoMobile')
  @ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: false })
  @ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: false })
  @ApiQuery({ name: 'apos', required: false, example: '0' })
  @ApiQuery({ name: 'limite', required: false, example: '100' })
  @ApiOperation({ operationId: 'sincronizarIncremental', summary: 'Lista eventos autorizados depois do cursor aplicado' })
  @ApiOkResponse({ type: LoteSincronizacaoDto })
  public async sincronizar(
    @Headers('authorization') autorizacao: string | undefined,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredoDispositivo: string | undefined,
    @Query('apos') apos = '0',
    @Query('limite') limite?: string,
  ): Promise<LoteSincronizacaoDto> {
    try {
      if (autorizacao !== undefined) {
        if (dispositivoId === undefined || segredoDispositivo === undefined) {
          throw new ErroNaoAutenticado();
        }
        const sessao = await this.autenticacaoMobile.autenticar(
          obterTokenAcesso(autorizacao),
          dispositivoId,
          segredoDispositivo,
        );
        return new LoteSincronizacaoDto(
          await this.sincronizacao.sincronizar(
            sessao.contexto,
            'MOBILE',
            apos,
            limite,
          ),
        );
      }
      const sessao = await this.autenticacaoWeb.autenticar(
        obterTokenSessaoWeb(cookies),
      );
      return new LoteSincronizacaoDto(
        await this.sincronizacao.sincronizar(
          sessao.contexto,
          'WEB',
          apos,
          limite,
        ),
      );
    } catch (erro) {
      if (erro instanceof ErroRessincronizacaoCompletaNecessaria) {
        throw new ExcecaoHttpCanonica(409, erro.message, 'É necessário reconstruir os dados sincronizados.');
      }
      if (erro instanceof ErroCursorSincronizacaoInvalido) {
        throw new ExcecaoHttpCanonica(400, erro.message, 'O cursor de sincronização é inválido.');
      }
      throw erro;
    }
  }
}
