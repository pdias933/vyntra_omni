import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
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
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ErroCanonicoDto } from '../sistema/dto/erro-canonico.dto.js';
import {
  EntradaReprocessamentoOperacaoDto,
  OperacaoSaudeAdministrativaDto,
  PainelSaudeAdministrativaDto,
} from './dto/saude-administrativa.dto.js';
import { ServicoSaudeAdministrativa } from './servico-saude-administrativa.js';

@ApiTags('saude-administrativa')
@ApiCookieAuth('sessaoWeb')
@Controller('administracao/saude')
export class ControladorSaudeAdministrativa {
  public constructor(
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoOrigemWeb)
    private readonly origens: ServicoOrigemWeb,
    @Inject(ServicoSaudeAdministrativa)
    private readonly saude: ServicoSaudeAdministrativa,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listarSaudeAdministrativa',
    summary: 'Lista componentes e falhas sem conteúdo protegido',
  })
  @ApiOkResponse({ type: PainelSaudeAdministrativaDto })
  public async listar(
    @Headers('cookie') cookies: string | undefined,
  ): Promise<PainelSaudeAdministrativaDto> {
    const sessao = await this.autenticacao.autenticar(
      obterTokenSessaoWeb(cookies),
    );
    return new PainelSaudeAdministrativaDto(
      await this.saude.listar(sessao.contexto),
    );
  }

  @Post('operacoes/:operacaoId/reprocessar')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaReprocessamentoOperacaoDto })
  @ApiOperation({
    operationId: 'reprocessarOperacaoAgora',
    summary: 'Antecipa execução ou reconciliação sem repetir efeito em linha',
  })
  @ApiOkResponse({ type: OperacaoSaudeAdministrativaDto })
  @ApiConflictResponse({ type: ErroCanonicoDto })
  public async reprocessar(
    @Param('operacaoId', new ParseUUIDPipe()) operacaoId: string,
    @Body() entrada: EntradaReprocessamentoOperacaoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<OperacaoSaudeAdministrativaDto> {
    this.origens.validar(origem);
    const operacao = await this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, agora, transacao) =>
        this.saude.reprocessarAgora(
          {
            estado: 'ATIVA',
            expiraEm: sessao.expiraEm,
            sessaoId: sessao.id,
            usuarioId: sessao.usuarioId,
          },
          operacaoId,
          entrada.versao_esperada,
          transacao,
          agora,
        ),
    );
    if (operacao === undefined) {
      throw new ExcecaoHttpCanonica(
        409,
        'OPERACAO_NAO_REPROCESSAVEL',
        'A operação mudou de estado ou já não pode ser reprocessada.',
      );
    }
    return new OperacaoSaudeAdministrativaDto(operacao);
  }
}
