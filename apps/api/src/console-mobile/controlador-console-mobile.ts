import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
  EntradaEnvioModeloWebDto,
  EntradaEnvioTextoWebDto,
  EntradaExecutarAcaoErpWebDto,
  EntradaLeituraTimelineWebDto,
  EntradaPrepararAcaoErpWebDto,
  MarcadorLeituraWebDto,
  MensagemCriadaWebDto,
  ModeloAprovadoWebDto,
  PaginaTimelineWebDto,
  PreviaAcaoErpWebDto,
  RespostaRapidaWebDto,
  ResultadoFinanceiroContatoWebDto,
  ResultadoAcaoErpWebDto,
} from '../console-web/dto/console-web.dto.js';
import { ServicoComposerWeb } from '../console-web/servico-composer-web.js';
import { ServicoContatoAcoesWeb } from '../console-web/servico-contato-acoes-web.js';
import { ServicoTimelineWeb } from '../console-web/servico-timeline-web.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ErroTextoLivreForaJanela } from '../janela-canal/erros-janela-canal.js';
import {
  EntradaReconciliarTextoMobileDto,
  ResultadoReconciliacaoTextoMobileDto,
} from './dto-console-mobile.js';

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
    @Inject(ServicoComposerWeb)
    private readonly composer: ServicoComposerWeb,
  ) {}

  @Get('atendimentos/:atendimentoId/respostas-rapidas')
  @ApiQuery({ name: 'busca', required: false })
  @ApiOperation({
    operationId: 'listarRespostasRapidasMobile',
    summary: 'Pesquisa respostas rápidas autorizadas no aplicativo',
  })
  @ApiOkResponse({ type: [RespostaRapidaWebDto] })
  public async listarRespostasRapidas(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
    @Query('busca') busca?: string,
  ): Promise<readonly RespostaRapidaWebDto[]> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    const itens = await this.composer.listarRespostasRapidas(
      sessao.contexto,
      atendimentoId,
      busca,
    );
    return itens.map((item) => new RespostaRapidaWebDto(item));
  }

  @Get('atendimentos/:atendimentoId/modelos-aprovados')
  @ApiQuery({ name: 'busca', required: false })
  @ApiOperation({
    operationId: 'listarModelosAprovadosMobile',
    summary: 'Pesquisa mensagens aprovadas para o aplicativo',
  })
  @ApiOkResponse({ type: [ModeloAprovadoWebDto] })
  public async listarModelosAprovados(
    @Param('atendimentoId') atendimentoId: string,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
    @Query('busca') busca?: string,
  ): Promise<readonly ModeloAprovadoWebDto[]> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    const itens = await this.composer.listarModelos(
      sessao.contexto,
      atendimentoId,
      busca,
    );
    return itens.map((item) => new ModeloAprovadoWebDto(item));
  }

  @Post('atendimentos/:atendimentoId/mensagens/texto')
  @ApiBody({ type: EntradaEnvioTextoWebDto })
  @ApiOperation({
    operationId: 'enviarTextoMobile',
    summary: 'Enfileira texto livre autorizado no aplicativo',
  })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  public async enviarTexto(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaEnvioTextoWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    try {
      const mensagem = await this.autenticacao.executarComSessaoAtual(
        tokenAcesso(autorizacao),
        cabecalhoObrigatorio(dispositivoId),
        cabecalhoObrigatorio(segredo),
        (sessao, _agora, transacao) =>
          this.composer.enviarTexto(
            contexto(sessao),
            atendimentoId,
            {
              mensagemClienteId: entrada.mensagem_cliente_id,
              ...(entrada.responde_a_mensagem_id === undefined
                ? {}
                : { respondeAMensagemId: entrada.responde_a_mensagem_id }),
              texto: entrada.texto,
            },
            transacao,
          ),
      );
      return new MensagemCriadaWebDto(mensagem);
    } catch (erro) {
      if (erro instanceof ErroTextoLivreForaJanela) {
        throw new ExcecaoHttpCanonica(
          409,
          'JANELA_META_EXPIRADA',
          'A janela de conversa expirou. Use uma mensagem aprovada.',
        );
      }
      throw erro;
    }
  }

  @Post('atendimentos/:atendimentoId/mensagens/texto/reconciliar')
  @ApiBody({ type: EntradaReconciliarTextoMobileDto })
  @ApiOperation({
    operationId: 'reconciliarTextoMobile',
    summary: 'Reconcilia e enfileira uma pendência de texto do aplicativo',
  })
  @ApiOkResponse({ type: ResultadoReconciliacaoTextoMobileDto })
  public async reconciliarTexto(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaReconciliarTextoMobileDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<ResultadoReconciliacaoTextoMobileDto> {
    const resultado = await this.autenticacao.executarComSessaoAtual(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
      (sessao, _agora, transacao) =>
        this.composer.reconciliarTexto(
          contexto(sessao),
          atendimentoId,
          {
            criadaDispositivoEm: new Date(entrada.criada_dispositivo_em),
            janelaExpiraEmObservada: new Date(
              entrada.janela_expira_em_observada,
            ),
            mensagemClienteId: entrada.mensagem_cliente_id,
            sequenciaObservada: BigInt(entrada.sequencia_observada),
            texto: entrada.texto,
            versaoAtribuicaoObservada:
              entrada.versao_atribuicao_observada,
            versaoContextoObservada: entrada.versao_contexto_observada,
            versaoEstadoObservada: entrada.versao_estado_observada,
          },
          transacao,
        ),
    );
    return new ResultadoReconciliacaoTextoMobileDto(resultado);
  }

  @Post('atendimentos/:atendimentoId/mensagens/modelo-aprovado')
  @ApiBody({ type: EntradaEnvioModeloWebDto })
  @ApiOperation({
    operationId: 'enviarModeloAprovadoMobile',
    summary: 'Enfileira uma mensagem aprovada autorizada no aplicativo',
  })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  public async enviarModeloAprovado(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaEnvioModeloWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    const mensagem = await this.autenticacao.executarComSessaoAtual(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
      (sessao, _agora, transacao) =>
        this.composer.enviarModelo(
          contexto(sessao),
          atendimentoId,
          {
            mensagemClienteId: entrada.mensagem_cliente_id,
            modeloId: entrada.modelo_id,
            parametros: entrada.parametros,
          },
          transacao,
        ),
    );
    return new MensagemCriadaWebDto(mensagem);
  }

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

  @Post('atendimentos/:atendimentoId/acoes-erp/preparar')
  @ApiBody({ type: EntradaPrepararAcaoErpWebDto })
  @ApiOperation({
    operationId: 'prepararAcaoErpContatoMobile',
    summary: 'Revalida e prepara uma ação ERP no aplicativo',
  })
  @ApiOkResponse({ type: PreviaAcaoErpWebDto })
  public async prepararAcaoErp(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaPrepararAcaoErpWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<PreviaAcaoErpWebDto> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new PreviaAcaoErpWebDto(
      await this.contato.prepararAcao(
        sessao.contexto,
        atendimentoId,
        entrada.acao,
      ),
    );
  }

  @Post('atendimentos/:atendimentoId/acoes-erp/executar')
  @ApiBody({ type: EntradaExecutarAcaoErpWebDto })
  @ApiOperation({
    operationId: 'executarAcaoErpContatoMobile',
    summary: 'Executa uma ação ERP confirmada no aplicativo',
  })
  @ApiOkResponse({ type: ResultadoAcaoErpWebDto })
  public async executarAcaoErp(
    @Param('atendimentoId') atendimentoId: string,
    @Body() entrada: EntradaExecutarAcaoErpWebDto,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<ResultadoAcaoErpWebDto> {
    const sessao = await this.autenticar(autorizacao, dispositivoId, segredo);
    return new ResultadoAcaoErpWebDto(
      await this.contato.executarAcao(sessao.contexto, atendimentoId, {
        acao: entrada.acao,
        chaveIdempotencia: entrada.chave_idempotencia,
        confirmacaoExplicita: true,
        ...(entrada.assunto === undefined
          ? {}
          : { assunto: entrada.assunto }),
        ...(entrada.descricao === undefined
          ? {}
          : { descricao: entrada.descricao }),
      }),
    );
  }

  @Post('atendimentos/:atendimentoId/mensagens/midia')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      properties: {
        arquivo: { format: 'binary', type: 'string' },
        mensagem_cliente_id: { format: 'uuid', type: 'string' },
      },
      required: ['arquivo', 'mensagem_cliente_id'],
      type: 'object',
    },
  })
  @ApiOperation({
    operationId: 'enviarMidiaMobile',
    summary: 'Valida e enfileira uma mídia online pelo aplicativo',
  })
  @ApiOkResponse({ type: MensagemCriadaWebDto })
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: 32 * 1024 * 1024, files: 1 },
    }),
  )
  public async enviarMidia(
    @Param('atendimentoId') atendimentoId: string,
    @UploadedFile()
    arquivo:
      | {
          readonly buffer: Buffer;
          readonly mimetype: string;
          readonly originalname: string;
        }
      | undefined,
    @Body('mensagem_cliente_id') mensagemClienteId: string | undefined,
    @Headers('authorization') autorizacao: string | undefined,
    @Headers(NOME_HEADER_DISPOSITIVO_MOBILE) dispositivoId: string | undefined,
    @Headers(NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE) segredo: string | undefined,
  ): Promise<MensagemCriadaWebDto> {
    if (arquivo === undefined || mensagemClienteId === undefined) {
      throw new ExcecaoHttpCanonica(
        400,
        'MIDIA_INVALIDA',
        'Selecione um arquivo permitido.',
      );
    }
    const mensagem = await this.autenticacao.executarComSessaoAtual(
      tokenAcesso(autorizacao),
      cabecalhoObrigatorio(dispositivoId),
      cabecalhoObrigatorio(segredo),
      (sessao, _agora, transacao) =>
        this.composer.enviarMidia(
          contexto(sessao),
          atendimentoId,
          {
            conteudo: arquivo.buffer,
            mensagemClienteId,
            mime: arquivo.mimetype,
            nomeArquivo: arquivo.originalname,
          },
          transacao,
        ),
    );
    return new MensagemCriadaWebDto(mensagem);
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
