import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  type MessageEvent,
  Query,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

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
import { CoordenadorSseSemLacuna } from './coordenador-sse-sem-lacuna.js';
import {
  ErroCursorSincronizacaoInvalido,
  ErroRessincronizacaoCompletaNecessaria,
} from './erros-sincronizacao.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';
import { ServicoAutorizacaoOffline } from './servico-autorizacao-offline.js';
import { ServicoRessincronizacaoCompleta } from './servico-ressincronizacao-completa.js';
import { RegistroConexoesSse } from './registro-conexoes-sse.js';

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
    @Inject(CoordenadorSseSemLacuna)
    private readonly coordenadorSse: CoordenadorSseSemLacuna,
    @Inject(ServicoAutorizacaoOffline)
    private readonly autorizacaoOffline: ServicoAutorizacaoOffline,
    @Inject(RegistroConexoesSse)
    private readonly conexoesSse: RegistroConexoesSse,
  ) {}

  @Sse('eventos')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  @ApiCookieAuth('sessaoWeb')
  @ApiProduces('text/event-stream')
  @ApiOperation({ operationId: 'acompanharEventosWeb', summary: 'Acompanha eventos web confirmados sem lacuna' })
  public async acompanharEventosWeb(
    @Headers('cookie') cookies: string | undefined,
    @Headers('last-event-id') ultimoEvento = '0',
  ): Promise<Observable<MessageEvent>> {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(ultimoEvento)) {
      throw new ExcecaoHttpCanonica(
        400,
        'CURSOR_SSE_INVALIDO',
        'O último evento informado é inválido.',
      );
    }
    const tokenSessao = obterTokenSessaoWeb(cookies);
    const sessao = await this.autenticacaoWeb.autenticar(tokenSessao);
    return new Observable<MessageEvent>((assinante) => {
      let removerRegistro: (() => void) | undefined;
      try {
        const removerRegistroAtual = this.conexoesSse.registrar(() =>
          assinante.complete(),
        );
        removerRegistro = removerRegistroAtual;
        const fecharCoordenador = this.coordenadorSse.abrir(
          sessao.contexto,
          ultimoEvento,
          {
            enviar: (evento) =>
              assinante.next({
                data: evento,
                id: evento.sequenciaEvento,
                type: 'evento',
              }),
            falhar: (erro) => assinante.error(erro),
            heartbeat: () =>
              assinante.next({ data: { estado: 'ATIVO' }, type: 'heartbeat' }),
            invalidarEscopo: () => assinante.complete(),
          },
          {
            validarAutoridade: async () => {
              await this.autenticacaoWeb.autenticar(tokenSessao);
            },
          },
        );
        return () => {
          removerRegistroAtual();
          fecharCoordenador();
        };
      } catch (erro) {
        removerRegistro?.();
        assinante.error(erro);
        return undefined;
      }
    });
  }

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
      const snapshot = await this.ressincronizacao.reconstruir(sessao.contexto);
      return new SnapshotSincronizacaoDto(
        snapshot,
        await this.autorizacaoOffline.emitir(sessao, snapshot),
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
