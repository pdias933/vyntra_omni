import { Body, Controller, Headers, Inject, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { NOME_HEADER_CSRF_WEB, obterTokenCsrfWeb, obterTokenSessaoWeb } from '../autenticacao/cookies-sessao-web.js';
import { ServicoAutenticacaoWeb } from '../autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../autenticacao/servico-origem-web.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { CopiaAtendimentoEmitidaDto, EntradaBaixarCopiaAtendimentoDto, EntradaCriarCopiaAtendimentoDto } from './dto-copia-atendimento.js';
import { ServicoCopiasAtendimento } from './servico-copias-atendimento.js';

interface RespostaHttp { setHeader(nome: string, valor: string): unknown }

@ApiTags('copias-atendimento')
@Controller('web')
export class ControladorCopiasAtendimentoWeb {
  public constructor(
    @Inject(ServicoAutenticacaoWeb) private readonly autenticacao: ServicoAutenticacaoWeb,
    @Inject(ServicoOrigemWeb) private readonly origens: ServicoOrigemWeb,
    @Inject(ServicoCopiasAtendimento) private readonly copias: ServicoCopiasAtendimento,
  ) {}

  @Post('atendimentos/:atendimentoId/copias')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaCriarCopiaAtendimentoDto })
  @ApiOperation({ operationId: 'criarCopiaAtendimentoWeb', summary: 'Cria token interno, efêmero e vinculado à sessão para a cópia do atendimento' })
  @ApiOkResponse({ type: CopiaAtendimentoEmitidaDto })
  public async criar(
    @Param('atendimentoId') atendimentoId: string,
    @Body() _entrada: EntradaCriarCopiaAtendimentoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
  ): Promise<CopiaAtendimentoEmitidaDto> {
    const copia = await this.executar(cookies, csrfCabecalho, origem, (sessao, transacao) => this.copias.criar(sessao, atendimentoId, transacao));
    return new CopiaAtendimentoEmitidaDto(copia);
  }

  @Post('copias/baixar')
  @ApiCookieAuth('sessaoWeb')
  @ApiHeader({ name: NOME_HEADER_CSRF_WEB, required: true })
  @ApiBody({ type: EntradaBaixarCopiaAtendimentoDto })
  @ApiProduces('text/plain')
  @ApiOperation({ operationId: 'baixarCopiaAtendimentoWeb', summary: 'Consome uma única vez a cópia vinculada à mesma sessão web' })
  public async baixar(
    @Body() entrada: EntradaBaixarCopiaAtendimentoDto,
    @Headers('cookie') cookies: string | undefined,
    @Headers(NOME_HEADER_CSRF_WEB) csrfCabecalho: string | undefined,
    @Headers('origin') origem: string | undefined,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<StreamableFile> {
    const arquivo = await this.executar(cookies, csrfCabecalho, origem, (sessao, transacao) => this.copias.baixar(sessao, entrada.token, transacao));
    resposta.setHeader('Cache-Control', 'private, no-store');
    resposta.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
    resposta.setHeader('Content-Type', 'text/plain; charset=utf-8');
    resposta.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new StreamableFile(Buffer.from(arquivo.conteudo, 'utf8'));
  }

  private async executar<Resultado>(
    cookies: string | undefined,
    csrfCabecalho: string | undefined,
    origem: string | undefined,
    operacao: (sessao: { readonly estado: 'ATIVA'; readonly expiraEm: Date; readonly sessaoId: string; readonly usuarioId: string }, transacao: TransacaoPrisma) => Promise<Resultado>,
  ): Promise<Resultado> {
    this.origens.validar(origem);
    return this.autenticacao.executarComSessaoAtual(
      obterTokenSessaoWeb(cookies),
      obterTokenCsrfWeb(cookies, csrfCabecalho),
      (sessao, _agora, transacao) => operacao({ estado: 'ATIVA', expiraEm: sessao.expiraEm, sessaoId: sessao.id, usuarioId: sessao.usuarioId }, transacao),
    );
  }
}
