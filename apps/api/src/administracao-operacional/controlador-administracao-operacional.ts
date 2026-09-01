import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import { ServicoCalendarios } from '../calendarios/servico-calendarios.js';
import { ServicoFilas } from '../filas/servico-filas.js';
import { EntradaCriacaoFilaOperacionalDto, EntradaOverrideCalendarioOperacionalDto, PainelAdministracaoOperacionalDto } from './dto/administracao-operacional.dto.js';
import { ServicoAdministracaoOperacional } from './servico-administracao-operacional.js';

@ApiTags('administracao-operacional')
@Controller('administracao/operacao')
export class ControladorAdministracaoOperacional {
  public constructor(@Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb, @Inject(ServicoOrigemWeb) private readonly origens: ServicoOrigemWeb, @Inject(ServicoAdministracaoOperacional) private readonly administracao: ServicoAdministracaoOperacional, @Inject(ServicoFilas) private readonly filas: ServicoFilas, @Inject(ServicoCalendarios) private readonly calendarios: ServicoCalendarios) {}

  @Get()
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'listarAdministracaoOperacional', summary: 'Lista contas, filas, calendários, SLA e integrações por capacidade' })
  @ApiOkResponse({ type: PainelAdministracaoOperacionalDto })
  public async listar(@Headers('cookie') cookies: string | undefined): Promise<PainelAdministracaoOperacionalDto> { const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies)); return new PainelAdministracaoOperacionalDto(await this.administracao.listar(sessao.contexto)); }

  @Post('filas')
  @ApiCookieAuth('sessaoWeb') @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true }) @ApiBody({ type: EntradaCriacaoFilaOperacionalDto })
  @ApiOperation({ operationId: 'criarFilaAdministracaoOperacional', summary: 'Cria fila por serviço de domínio auditado' }) @ApiOkResponse({ type: PainelAdministracaoOperacionalDto })
  public async criarFila(@Body() entrada: EntradaCriacaoFilaOperacionalDto, @Headers('cookie') cookies: string | undefined, @Headers(NOME_HEADER_CSRF_WEB) csrf: string | undefined, @Headers('origin') origem: string | undefined): Promise<PainelAdministracaoOperacionalDto> { const sessao = await this.executar(cookies, csrf, origem, (contexto, transacao) => this.filas.cadastrar(contexto, { nome: entrada.nome }, transacao)); return new PainelAdministracaoOperacionalDto(await this.administracao.listar(sessao)); }

  @Post('filas/:filaId/inativar')
  @HttpCode(HttpStatus.NO_CONTENT) @ApiCookieAuth('sessaoWeb') @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiOperation({ operationId: 'inativarFilaAdministracaoOperacional', summary: 'Inativa fila e invalida acessos afetados' }) @ApiNoContentResponse()
  public async inativarFila(@Param('filaId') filaId: string, @Headers('cookie') cookies: string | undefined, @Headers(NOME_HEADER_CSRF_WEB) csrf: string | undefined, @Headers('origin') origem: string | undefined): Promise<void> { await this.executar(cookies, csrf, origem, (contexto, transacao) => this.filas.inativar(contexto, filaId, transacao)); }

  @Post('calendarios/:calendarioId/override')
  @ApiCookieAuth('sessaoWeb') @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true }) @ApiBody({ type: EntradaOverrideCalendarioOperacionalDto })
  @ApiOperation({ operationId: 'definirOverrideCalendarioAdministracaoOperacional', summary: 'Define abertura ou fechamento temporário auditado' }) @ApiOkResponse({ type: PainelAdministracaoOperacionalDto })
  public async definirOverride(@Param('calendarioId') calendarioId: string, @Body() entrada: EntradaOverrideCalendarioOperacionalDto, @Headers('cookie') cookies: string | undefined, @Headers(NOME_HEADER_CSRF_WEB) csrf: string | undefined, @Headers('origin') origem: string | undefined): Promise<PainelAdministracaoOperacionalDto> { const sessao = await this.executar(cookies, csrf, origem, (contexto, transacao) => this.calendarios.definirOverride(contexto, calendarioId, entrada.estado, entrada.motivo, new Date(entrada.vigente_de), new Date(entrada.vigente_ate), transacao)); return new PainelAdministracaoOperacionalDto(await this.administracao.listar(sessao)); }

  private async executar<Resultado>(cookies: string | undefined, csrf: string | undefined, origem: string | undefined, operacao: (sessao: { readonly estado: 'ATIVA'; readonly expiraEm: Date; readonly sessaoId: string; readonly usuarioId: string }, transacao: Parameters<Parameters<ServicoAutenticacaoWeb['executarComSessaoAtual']>[2]>[2]) => Promise<Resultado>) { this.origens.validar(origem); return this.autenticacao.executarComSessaoAtual(obterTokenSessaoWeb(cookies), obterTokenCsrfWeb(cookies, csrf), async (sessao, _agora, transacao) => { const contexto = { estado: 'ATIVA' as const, expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId }; await operacao(contexto, transacao); return contexto; }); }
}
