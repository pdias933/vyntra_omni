import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import type { SessaoMobilePersistida } from '../autenticacao/modelo-autenticacao-mobile.js';
import { ServicoAutenticacaoMobile } from '../autenticacao/servico-autenticacao-mobile.js';
import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import {
  DetalhesContatoWebDto,
  EntradaAlterarContextoWebDto,
  EntradaLeituraTimelineWebDto,
  MarcadorLeituraWebDto,
  PaginaTimelineWebDto,
  ResultadoFinanceiroContatoWebDto,
} from '../console-web/dto/console-web.dto.js';
import { ServicoContatoAcoesWeb } from '../console-web/servico-contato-acoes-web.js';
import { ServicoTimelineWeb } from '../console-web/servico-timeline-web.js';

function tokenAcesso(cabecalho: string | undefined): string {
  const resultado = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(cabecalho ?? '');
  if (resultado?.[1] === undefined) throw new ErroNaoAutenticado();
  return resultado[1];
}

function cabecalhoObrigatorio(valor: string | undefined): string {
  if (valor === undefined || valor.length === 0) throw new ErroNaoAutenticado();
  return valor;
}

function contexto(sessao: SessaoMobilePersistida): ContextoSessaoAutorizacao {
  return {
    estado: 'ATIVA',
    expiraEm: sessao.acessoExpiraEm,
    sessaoId: sessao.id,
    usuarioId: sessao.usuarioId,
  };
}

@ApiTags('console-mobile')
@ApiBearerAuth('sessaoMobile')
@ApiHeader({ name: NOME_HEADER_DISPOSITIVO_MOBILE, required: true })
@ApiHeader({ name: NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE, required: true })
@Controller('mobile')
export class ControladorConsoleMobile {
  public constructor(
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacao: ServicoAutenticacaoMobile,
    @Inject(ServicoTimelineWeb)
    private readonly timeline: ServicoTimelineWeb,
    @Inject(ServicoContatoAcoesWeb)
    private readonly contato: ServicoContatoAcoesWeb,
  ) {}

  @Get('atendimentos/:atendimentoId/timeline')
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({
    operationId: 'obterTimelineMobile',
    summary: 'Obtém uma página autorizada da timeline única no aplicativo',
  })
  @ApiOkResponse({ type: PaginaTimelineWebDto })
  public async obterTimeline(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaTimelineWebDto> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new PaginaTimelineWebDto(
      await this.timeline.obter(sessao.contexto, atendimentoId, cursor),
    );
  }

  @Get('atendimentos/:atendimentoId/contato')
  @ApiOperation({
    operationId: 'obterDetalhesContatoMobile',
    summary: 'Obtém identidade e contexto autorizados do contato no aplicativo',
  })
  @ApiOkResponse({ type: DetalhesContatoWebDto })
  public async obterDetalhes(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<DetalhesContatoWebDto> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new DetalhesContatoWebDto(
      await this.contato.obterDetalhes(sessao.contexto, atendimentoId),
    );
  }

  @Get('atendimentos/:atendimentoId/financeiro')
  @ApiOperation({
    operationId: 'consultarFinanceiroContatoMobile',
    summary: 'Consulta o resumo financeiro autorizado no aplicativo',
  })
  @ApiOkResponse({ type: ResultadoFinanceiroContatoWebDto })
  public async consultarFinanceiro(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<ResultadoFinanceiroContatoWebDto> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new ResultadoFinanceiroContatoWebDto(
      await this.contato.consultarFinanceiro(sessao.contexto, atendimentoId),
    );
  }

  @Post('atendimentos/:atendimentoId/leitura')
  @ApiBody({ type: EntradaLeituraTimelineWebDto })
  @ApiOperation({
    operationId: 'confirmarLeituraTimelineMobile',
    summary: 'Avança o marcador pessoal de leitura no aplicativo',
  })
  @ApiOkResponse({ type: MarcadorLeituraWebDto })
  public async confirmarLeitura(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaLeituraTimelineWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<MarcadorLeituraWebDto> {
    const versao = await this.autenticacao.executarComSessaoAtual(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
      (sessao, _agora, transacao) =>
        this.timeline.marcarLida(
          contexto(sessao),
          atendimentoId,
          entrada.mensagem_id,
          entrada.versao_esperada,
          transacao,
        ),
    );
    return new MarcadorLeituraWebDto(versao);
  }

  @Post('atendimentos/:atendimentoId/contexto')
  @ApiBody({ type: EntradaAlterarContextoWebDto })
  @ApiOperation({
    operationId: 'alterarContextoContatoMobile',
    summary: 'Troca o cliente e contrato ativos no aplicativo',
  })
  @ApiOkResponse({ type: DetalhesContatoWebDto })
  public async alterarContexto(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaAlterarContextoWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<DetalhesContatoWebDto> {
    await this.autenticacao.executarComSessaoAtual(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
      async (atual, _agora, transacao) => {
        const sessaoAtual = contexto(atual);
        await this.contato.alterarContexto(
          sessaoAtual,
          atendimentoId,
          {
            versaoEsperada: entrada.versao_esperada,
            vinculoClienteId: entrada.vinculo_cliente_id,
            ...(entrada.vinculo_contrato_id === undefined
              ? {}
              : { vinculoContratoId: entrada.vinculo_contrato_id }),
          },
          transacao,
        );
      },
    );
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new DetalhesContatoWebDto(
      await this.contato.obterDetalhes(sessao.contexto, atendimentoId),
    );
  }

  private autenticar(
    autorizacao: string | undefined,
    dispositivoId: string | undefined,
    segredo: string | undefined,
  ) {
    return this.autenticacao.autenticar(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
    );
  }
}
