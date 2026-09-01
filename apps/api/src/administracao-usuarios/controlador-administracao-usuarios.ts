import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import { EntradaAlteracaoAcessoUsuarioDto, PainelAdministracaoUsuariosDto, ResultadoAlteracaoAcessoUsuarioDto } from './dto/administracao-usuarios.dto.js';
import { ServicoAdministracaoUsuarios } from './servico-administracao-usuarios.js';

@ApiTags('administracao-usuarios')
@Controller('administracao/usuarios')
export class ControladorAdministracaoUsuarios {
  public constructor(@Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb, @Inject(ServicoOrigemWeb) private readonly origens: ServicoOrigemWeb, @Inject(ServicoAdministracaoUsuarios) private readonly administracao: ServicoAdministracaoUsuarios) {}

  @Get()
  @ApiCookieAuth('sessaoWeb')
  @ApiOperation({ operationId: 'listarAdministracaoUsuarios', summary: 'Lista usuários, RBAC, filas, sessões e auditoria autorizados' })
  @ApiOkResponse({ type: PainelAdministracaoUsuariosDto })
  public async listar(@Headers('cookie') cookies: string | undefined): Promise<PainelAdministracaoUsuariosDto> {
    const sessao = await this.autenticacao.autenticar(obterTokenSessaoWeb(cookies));
    return new PainelAdministracaoUsuariosDto(await this.administracao.listar(sessao.contexto));
  }

  @Put(':usuarioId/acesso')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaAlteracaoAcessoUsuarioDto })
  @ApiOperation({ operationId: 'alterarAcessoUsuarioAdministracao', summary: 'Altera perfil e filas com versão esperada e invalidação imediata' })
  @ApiOkResponse({ type: ResultadoAlteracaoAcessoUsuarioDto })
  public async alterar(@Param('usuarioId') usuarioId: string, @Body() entrada: EntradaAlteracaoAcessoUsuarioDto, @Headers('cookie') cookies: string | undefined, @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined, @Headers('origin') origem: string | undefined): Promise<ResultadoAlteracaoAcessoUsuarioDto> {
    this.origens.validar(origem);
    const versao = await this.autenticacao.executarComSessaoAtual(obterTokenSessaoWeb(cookies), obterTokenCsrfWeb(cookies, csrfCabecalho), (sessao, _agora, transacao) => this.administracao.alterarAcesso({ estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId }, usuarioId, { filaIds: entrada.fila_ids, perfilId: entrada.perfil_id, versaoEsperada: entrada.versao_esperada }, transacao));
    return new ResultadoAlteracaoAcessoUsuarioDto(versao);
  }
}
