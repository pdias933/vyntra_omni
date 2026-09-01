import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAtribuicoesAtendimento } from '../atribuicoes-atendimento/servico-atribuicoes-atendimento.js';
import {
  ErroCalendarioAusente,
  ErroCalendarioInvalido,
} from '../calendarios/erros-calendario.js';
import { ServicoCalendarios } from '../calendarios/servico-calendarios.js';
import { ServicoContextosCliente } from '../contextos-cliente/servico-contextos-cliente.js';
import type {
  ConexaoDefinicaoFluxo,
  DefinicaoFluxoV1,
  NoDefinicaoFluxo,
  VariavelDefinicaoFluxo,
} from '../fluxos/modelo-validacao-fluxo.js';
import { ServicoCatalogoFluxos } from '../fluxos/servico-catalogo-fluxos.js';
import { ServicoFormularios } from '../formularios/servico-formularios.js';
import {
  avaliarCondicaoTipada,
  ehOperadorCondicaoFluxo,
  valorCompativelComTipo,
} from '../fluxos/valor-variavel-fluxo.js';
import { ServicoMensagensSaida } from '../mensagens/servico-mensagens-saida.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';
import {
  definirSelecaoFaturaExecucaoFluxo,
  removerSelecaoFaturaExecucaoFluxo,
} from './contexto-fatura-execucao-fluxo.js';
import {
  agendarEsperaFluxo,
  lerEsperaFluxo,
  removerEsperaFluxo,
} from './contexto-espera-execucao-fluxo.js';
import {
  definirValorVariavelExecucao,
  lerValorVariavelExecucao,
  registrarIteracaoNoFluxo,
} from './contexto-variaveis-execucao-fluxo.js';
import {
  ErroConflitoExecucaoFluxo,
  ErroExecucaoFluxoInvalida,
} from './erros-execucao-fluxo.js';
import type { ExecucaoFluxoPersistida } from './modelo-execucao-fluxo.js';
import type {
  PassoExecucaoFluxoPersistido,
  ResultadoNoMensagemFluxo,
} from './modelo-passo-execucao-fluxo.js';
import {
  REPOSITORIO_EXECUCOES_FLUXO,
  type RepositorioExecucoesFluxo,
} from './repositorio-execucoes-fluxo.js';
import {
  REPOSITORIO_PASSOS_EXECUCAO_FLUXO,
  type RepositorioPassosExecucaoFluxo,
} from './repositorio-passos-execucao-fluxo.js';
import { ServicoExecucoesFluxo } from './servico-execucoes-fluxo.js';
import {
  ServicoDesbloqueiosFluxo,
  type PreparacaoNoDesbloqueioFluxo,
  type ResultadoNoDesbloqueioFluxo,
  type TipoNoDesbloqueioFluxo,
} from './servico-desbloqueios-fluxo.js';
import {
  ServicoFaturasFluxo,
  type PreparacaoNoFaturaFluxo,
  type ResultadoNoFaturaFluxo,
  type TipoNoFaturaFluxo,
} from './servico-faturas-fluxo.js';
import {
  ServicoProtocolosOrdensFluxo,
  type PreparacaoNoProtocoloOrdemFluxo,
  type ResultadoNoProtocoloOrdemFluxo,
  type TipoNoProtocoloOrdemFluxo,
} from './servico-protocolos-ordens-fluxo.js';

const TIPOS_SUPORTADOS = new Set([
  'AGUARDAR',
  'CONDICAO',
  'CONSULTAR_FATURAS',
  'CRIAR_ATENDIMENTO',
  'CRIAR_ORDEM_SERVICO',
  'DEFINIR_VARIAVEL',
  'ENVIAR_BOTOES_OU_LISTA',
  'ENVIAR_MENSAGEM',
  'ENVIAR_FATURA',
  'ENCERRAR_ATENDIMENTO',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'FIM',
  'HORARIO_ATENDIMENTO',
  'IDENTIFICAR_CONTATO',
  'INICIO',
  'SELECIONAR_CLIENTE',
  'SELECIONAR_CONTRATO',
  'SOLICITAR_DADOS_CONTATO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'TRANSFERIR_PARA_FILA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'AGUARDAR_ATENDENTE',
]);

interface ResultadoExecucaoNo {
  readonly resultado: string;
  readonly agendamento?: {
    readonly estadoEspera:
      | 'AGUARDANDO_RESPOSTA'
      | 'AGUARDANDO_SISTEMA'
      | 'AGUARDANDO_ATENDENTE';
    readonly retomarEm: Date;
  };
  readonly conclusaoEspecial?:
    | 'CONCLUIR'
    | 'SUSPENDER_POR_ATENDIMENTO_HUMANO';
  readonly codigo?: string | undefined;
  readonly contextoProtegido?: ObjetoJsonProtegido | undefined;
  readonly mensagem?: { readonly id: string } | undefined;
}

interface AcaoExternaFatura {
  readonly preparacao: PreparacaoNoFaturaFluxo;
  readonly resultado: ResultadoNoFaturaFluxo;
}

interface AcaoExternaProtocoloOrdem {
  readonly preparacao: PreparacaoNoProtocoloOrdemFluxo;
  readonly resultado: ResultadoNoProtocoloOrdemFluxo;
}

interface AcaoExternaDesbloqueio {
  readonly preparacao: PreparacaoNoDesbloqueioFluxo;
  readonly resultado: ResultadoNoDesbloqueioFluxo;
}

@Injectable()
export class ServicoExecutorNosFluxo {
  public constructor(
    @Inject(REPOSITORIO_EXECUCOES_FLUXO)
    private readonly repositorioExecucoes: RepositorioExecucoesFluxo,
    @Inject(REPOSITORIO_PASSOS_EXECUCAO_FLUXO)
    private readonly repositorioPassos: RepositorioPassosExecucaoFluxo,
    @Inject(ServicoCatalogoFluxos)
    private readonly catalogo: ServicoCatalogoFluxos,
    @Inject(ServicoCalendarios)
    private readonly calendarios: ServicoCalendarios,
    @Inject(ServicoContextosCliente)
    private readonly contextosCliente: ServicoContextosCliente,
    @Inject(ServicoMensagensSaida)
    private readonly mensagens: ServicoMensagensSaida,
    @Inject(ServicoExecucoesFluxo)
    private readonly execucoes: ServicoExecucoesFluxo,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
    @Inject(ServicoFaturasFluxo)
    private readonly faturas: ServicoFaturasFluxo,
    @Inject(ServicoFormularios)
    private readonly formularios: ServicoFormularios,
    @Inject(ServicoProtocolosOrdensFluxo)
    private readonly protocolosOrdens: ServicoProtocolosOrdensFluxo,
    @Inject(ServicoDesbloqueiosFluxo)
    private readonly desbloqueios: ServicoDesbloqueiosFluxo,
    @Inject(ServicoAtribuicoesAtendimento)
    private readonly atribuicoes: ServicoAtribuicoesAtendimento,
  ) {}

  public async executarCiclo(
    limite = 50,
    relogio: () => Date = () => new Date(),
  ): Promise<number> {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new ErroExecucaoFluxoInvalida();
    }
    let processadas = 0;
    while (processadas < limite) {
      let selecionada: ExecucaoFluxoPersistida | undefined;
      let preparacaoFatura: PreparacaoNoFaturaFluxo | undefined;
      let preparacaoDesbloqueio: PreparacaoNoDesbloqueioFluxo | undefined;
      let preparacaoProtocoloOrdem:
        | PreparacaoNoProtocoloOrdemFluxo
        | undefined;
      try {
        const encontrou = await this.prisma.executarTransacao(
          async (transacao) => {
            const [execucao] =
              await this.repositorioExecucoes.listarProntasParaExecutar(
                1,
                transacao,
              );
            selecionada = execucao;
            if (execucao === undefined) return false;
            preparacaoFatura = await this.prepararNoFatura(
              execucao,
              transacao,
            );
            if (preparacaoFatura !== undefined) return true;
            preparacaoDesbloqueio = await this.prepararNoDesbloqueio(
              execucao,
              transacao,
            );
            if (preparacaoDesbloqueio !== undefined) return true;
            preparacaoProtocoloOrdem =
              await this.prepararNoProtocoloOrdem(execucao, transacao);
            if (preparacaoProtocoloOrdem !== undefined) return true;
            await this.executarNo(execucao, transacao, relogio);
            return true;
          },
        );
        if (!encontrou) break;
        if (preparacaoFatura !== undefined && selecionada !== undefined) {
          const execucaoPreparada = selecionada;
          const resultado = await this.faturas.executar(
            preparacaoFatura,
            relogio,
          );
          const acao: AcaoExternaFatura = {
            preparacao: preparacaoFatura,
            resultado,
          };
          await this.prisma.executarTransacao(async (transacao) => {
            const atual = await this.repositorioExecucoes.obterPorId(
              execucaoPreparada.id,
              transacao,
            );
            if (
              atual === undefined ||
              atual.estado !== 'EXECUTANDO' ||
              atual.revisao !== execucaoPreparada.revisao ||
              atual.noAtualId !== execucaoPreparada.noAtualId
            ) {
              return;
            }
            await this.executarNo(atual, transacao, relogio, acao);
          });
        } else if (
          preparacaoDesbloqueio !== undefined &&
          selecionada !== undefined
        ) {
          const execucaoPreparada = selecionada;
          const resultado = await this.desbloqueios.executar(
            preparacaoDesbloqueio,
            relogio,
          );
          const acao: AcaoExternaDesbloqueio = {
            preparacao: preparacaoDesbloqueio,
            resultado,
          };
          await this.prisma.executarTransacao(async (transacao) => {
            const atual = await this.repositorioExecucoes.obterPorId(
              execucaoPreparada.id,
              transacao,
            );
            if (
              atual === undefined ||
              atual.estado !== 'EXECUTANDO' ||
              atual.revisao !== execucaoPreparada.revisao ||
              atual.noAtualId !== execucaoPreparada.noAtualId
            ) {
              return;
            }
            await this.executarNo(
              atual,
              transacao,
              relogio,
              undefined,
              undefined,
              acao,
            );
          });
        } else if (
          preparacaoProtocoloOrdem !== undefined &&
          selecionada !== undefined
        ) {
          const execucaoPreparada = selecionada;
          const resultado = await this.protocolosOrdens.executar(
            preparacaoProtocoloOrdem,
          );
          const acao: AcaoExternaProtocoloOrdem = {
            preparacao: preparacaoProtocoloOrdem,
            resultado,
          };
          await this.prisma.executarTransacao(async (transacao) => {
            const atual = await this.repositorioExecucoes.obterPorId(
              execucaoPreparada.id,
              transacao,
            );
            if (
              atual === undefined ||
              atual.estado !== 'EXECUTANDO' ||
              atual.revisao !== execucaoPreparada.revisao ||
              atual.noAtualId !== execucaoPreparada.noAtualId
            ) {
              return;
            }
            await this.executarNo(
              atual,
              transacao,
              relogio,
              undefined,
              acao,
            );
          });
        }
      } catch (erro) {
        if (
          !(erro instanceof ErroExecucaoFluxoInvalida) ||
          selecionada === undefined
        ) {
          throw erro;
        }
        await this.falharDefinicaoInvalida(selecionada, relogio);
      }
      processadas += 1;
    }
    return processadas;
  }

  private async falharDefinicaoInvalida(
    selecionada: ExecucaoFluxoPersistida,
    relogio: () => Date,
  ): Promise<void> {
    await this.prisma.executarTransacao(async (transacao) => {
      const atual = await this.repositorioExecucoes.obterPorId(
        selecionada.id,
        transacao,
      );
      if (
        atual === undefined ||
        atual.estado !== 'EXECUTANDO' ||
        atual.revisao !== selecionada.revisao
      ) {
        return;
      }
      await this.execucoes.transitar(
        {
          comando: { codigo: 'DEFINICAO_FLUXO_INVALIDA', tipo: 'FALHAR' },
          execucaoFluxoId: atual.id,
          revisaoEsperada: atual.revisao,
        },
        transacao,
        relogio,
      );
    });
  }

  private async prepararNoFatura(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoFaturaFluxo | undefined> {
    const versao = await this.catalogo.obterVersaoFixaExecucao(
      execucao.versaoFluxoId,
      execucao.fluxoId,
      transacao,
    );
    const definicao = this.lerDefinicao(versao.definicao);
    const no = definicao.nos.find(({ id }) => id === execucao.noAtualId);
    if (
      no?.tipo !== 'CONSULTAR_FATURAS' &&
      no?.tipo !== 'ENVIAR_FATURA'
    ) {
      return undefined;
    }
    if (!this.configuracaoNoFaturaValida(no)) {
      return {
        codigo: 'CONFIGURACAO_FATURA_INVALIDA',
        resultado: 'FALHA',
        tipo: no.tipo,
      };
    }
    return this.faturas.preparar(
      no.tipo,
      execucao.atendimentoId,
      execucao.contextoProtegido,
      transacao,
    );
  }

  private async prepararNoProtocoloOrdem(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoProtocoloOrdemFluxo | undefined> {
    const versao = await this.catalogo.obterVersaoFixaExecucao(
      execucao.versaoFluxoId,
      execucao.fluxoId,
      transacao,
    );
    const definicao = this.lerDefinicao(versao.definicao);
    const no = definicao.nos.find(({ id }) => id === execucao.noAtualId);
    if (
      no?.tipo !== 'CRIAR_ATENDIMENTO' &&
      no?.tipo !== 'CRIAR_ORDEM_SERVICO'
    ) {
      return undefined;
    }
    return this.protocolosOrdens.preparar(
      no as NoDefinicaoFluxo & {
        readonly tipo: TipoNoProtocoloOrdemFluxo;
      },
      execucao,
      transacao,
    );
  }

  private async prepararNoDesbloqueio(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
  ): Promise<PreparacaoNoDesbloqueioFluxo | undefined> {
    const versao = await this.catalogo.obterVersaoFixaExecucao(
      execucao.versaoFluxoId,
      execucao.fluxoId,
      transacao,
    );
    const definicao = this.lerDefinicao(versao.definicao);
    const no = definicao.nos.find(({ id }) => id === execucao.noAtualId);
    if (
      no?.tipo !== 'VERIFICAR_DESBLOQUEIO_CONFIANCA' &&
      no?.tipo !== 'EXECUTAR_DESBLOQUEIO_CONFIANCA'
    ) {
      return undefined;
    }
    return this.desbloqueios.preparar(
      no as NoDefinicaoFluxo & { readonly tipo: TipoNoDesbloqueioFluxo },
      execucao,
      transacao,
    );
  }

  private async executarNo(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
    acaoFatura?: AcaoExternaFatura,
    acaoProtocoloOrdem?: AcaoExternaProtocoloOrdem,
    acaoDesbloqueio?: AcaoExternaDesbloqueio,
  ): Promise<void> {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime()) || agora < execucao.atualizadaEm) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const versao = await this.catalogo.obterVersaoFixaExecucao(
      execucao.versaoFluxoId,
      execucao.fluxoId,
      transacao,
    );
    const definicao = this.lerDefinicao(versao.definicao);
    const no = definicao.nos.find(({ id }) => id === execucao.noAtualId);
    if (no === undefined || !TIPOS_SUPORTADOS.has(no.tipo)) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const passo: PassoExecucaoFluxoPersistido = {
      entradaSanitizada: { tipoNo: no.tipo },
      estado: 'INICIADO',
      execucaoFluxoId: execucao.id,
      id: randomUUID(),
      iniciadoEm: agora,
      noId: no.id,
      revisaoExecucao: execucao.revisao,
      tipoNo: no.tipo,
    };
    if (!(await this.repositorioPassos.iniciar(passo, transacao))) {
      throw new ErroConflitoExecucaoFluxo();
    }

    if (no.tipo === 'FIM') {
      await this.finalizarPasso(
        passo,
        { resultado: 'CONCLUIDO' },
        undefined,
        agora,
        transacao,
      );
      await this.execucoes.transitar(
        {
          comando: { tipo: 'CONCLUIR' },
          execucaoFluxoId: execucao.id,
          revisaoEsperada: execucao.revisao,
        },
        transacao,
        () => agora,
      );
      return;
    }

    const resultado = await this.executarOperacaoNo(
      no,
      definicao,
      execucao,
      transacao,
      relogio,
      acaoFatura,
      acaoProtocoloOrdem,
      acaoDesbloqueio,
    );
    if (resultado.agendamento !== undefined) {
      await this.finalizarPasso(
        passo,
        { resultado: 'AGENDADO' },
        undefined,
        agora,
        transacao,
      );
      await this.execucoes.agendarRetomada(
        {
          contextoProtegido:
            resultado.contextoProtegido ?? execucao.contextoProtegido,
          estadoEspera: resultado.agendamento.estadoEspera,
          execucaoFluxoId: execucao.id,
          retomarEm: resultado.agendamento.retomarEm,
          revisaoEsperada: execucao.revisao,
        },
        transacao,
        () => agora,
      );
      return;
    }
    const saida = this.validarSaida(no, resultado.resultado);
    const codigo = resultado.codigo;
    const mensagemId = resultado.mensagem?.id;
    await this.finalizarPasso(
      passo,
      {
        ...(mensagemId === undefined ? {} : { mensagemId }),
        resultado: saida,
      },
      codigo,
      agora,
      transacao,
    );
    if (resultado.conclusaoEspecial !== undefined) {
      await this.execucoes.transitar(
        {
          comando: { tipo: resultado.conclusaoEspecial },
          execucaoFluxoId: execucao.id,
          revisaoEsperada: execucao.revisao,
        },
        transacao,
        () => agora,
      );
      return;
    }
    const destino = this.obterDestino(definicao.conexoes, no.id, saida);
    await this.execucoes.avancarNo(
      {
        ...(resultado.contextoProtegido === undefined
          ? {}
          : { contextoProtegido: resultado.contextoProtegido }),
        execucaoFluxoId: execucao.id,
        proximoNoId: destino,
        revisaoEsperada: execucao.revisao,
      },
      transacao,
      () => agora,
    );
  }

  private async executarOperacaoNo(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
    acaoFatura?: AcaoExternaFatura,
    acaoProtocoloOrdem?: AcaoExternaProtocoloOrdem,
    acaoDesbloqueio?: AcaoExternaDesbloqueio,
  ): Promise<ResultadoExecucaoNo> {
    if (no.tipo === 'AGUARDAR') {
      return this.executarEspera(no, execucao, relogio);
    }
    const iteracao = registrarIteracaoNoFluxo(
      execucao.contextoProtegido,
      no.id,
      no.limiteIteracoes,
    );
    if (!iteracao.valido) {
      return {
        codigo: 'CONTEXTO_ITERACOES_INVALIDO',
        resultado: 'FALHA',
      };
    }
    if (iteracao.excedeu) {
      return {
        codigo: 'LIMITE_ITERACOES_EXCEDIDO',
        contextoProtegido: iteracao.contexto,
        resultado: 'FALHA',
      };
    }
    if (no.tipo === 'INICIO') return { resultado: 'SUCESSO' };
    if (
      no.tipo === 'ENVIAR_MENSAGEM' ||
      no.tipo === 'ENVIAR_BOTOES_OU_LISTA'
    ) {
      return this.executarMensagem(no, execucao, transacao, relogio);
    }
    if (no.tipo === 'DEFINIR_VARIAVEL') {
      return this.definirVariavel(no, definicao, iteracao.contexto);
    }
    if (no.tipo === 'CONDICAO') {
      return this.avaliarCondicao(no, definicao, iteracao.contexto);
    }
    if (no.tipo === 'HORARIO_ATENDIMENTO') {
      return this.avaliarHorarioAtendimento(
        no,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    if (no.tipo === 'CONSULTAR_FATURAS' || no.tipo === 'ENVIAR_FATURA') {
      return this.aplicarNoFatura(
        no,
        execucao,
        iteracao.contexto,
        acaoFatura,
        transacao,
        relogio,
      );
    }
    if (
      no.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA' ||
      no.tipo === 'EXECUTAR_DESBLOQUEIO_CONFIANCA'
    ) {
      return this.aplicarNoDesbloqueio(
        no,
        iteracao.contexto,
        acaoDesbloqueio,
      );
    }
    if (
      no.tipo === 'TRANSFERIR_PARA_FILA' ||
      no.tipo === 'AGUARDAR_ATENDENTE' ||
      no.tipo === 'ENCERRAR_ATENDIMENTO'
    ) {
      return this.executarRoteamentoAtendimento(
        no,
        definicao,
        execucao,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    if (
      no.tipo === 'IDENTIFICAR_CONTATO' ||
      no.tipo === 'SELECIONAR_CLIENTE' ||
      no.tipo === 'SELECIONAR_CONTRATO' ||
      no.tipo === 'SOLICITAR_DADOS_CONTATO'
    ) {
      return this.executarIdentidade(
        no,
        definicao,
        execucao,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    if (no.tipo === 'SOLICITAR_FORMULARIO_WHATSAPP') {
      return this.executarFormulario(
        no,
        execucao,
        iteracao.contexto,
        transacao,
        relogio,
      );
    }
    if (
      no.tipo === 'CRIAR_ATENDIMENTO' ||
      no.tipo === 'CRIAR_ORDEM_SERVICO'
    ) {
      return this.aplicarNoProtocoloOrdem(
        no,
        iteracao.contexto,
        acaoProtocoloOrdem,
      );
    }
    throw new ErroExecucaoFluxoInvalida();
  }

  private aplicarNoProtocoloOrdem(
    no: NoDefinicaoFluxo,
    contexto: ObjetoJsonProtegido,
    acao: AcaoExternaProtocoloOrdem | undefined,
  ): ResultadoExecucaoNo {
    if (
      (no.tipo !== 'CRIAR_ATENDIMENTO' &&
        no.tipo !== 'CRIAR_ORDEM_SERVICO') ||
      acao === undefined ||
      acao.preparacao.tipo !== no.tipo
    ) {
      return {
        codigo: 'CONFIGURACAO_OPERACAO_ERP_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    return {
      ...('codigo' in acao.resultado
        ? { codigo: acao.resultado.codigo }
        : {}),
      contextoProtegido: contexto,
      resultado: acao.resultado.resultado,
    };
  }

  private aplicarNoDesbloqueio(
    no: NoDefinicaoFluxo,
    contexto: ObjetoJsonProtegido,
    acao: AcaoExternaDesbloqueio | undefined,
  ): ResultadoExecucaoNo {
    if (
      (no.tipo !== 'VERIFICAR_DESBLOQUEIO_CONFIANCA' &&
        no.tipo !== 'EXECUTAR_DESBLOQUEIO_CONFIANCA') ||
      acao === undefined ||
      acao.preparacao.tipo !== no.tipo
    ) {
      return {
        codigo: 'CONFIGURACAO_DESBLOQUEIO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    return {
      ...('codigo' in acao.resultado
        ? { codigo: acao.resultado.codigo }
        : {}),
      contextoProtegido: contexto,
      resultado: acao.resultado.resultado,
    };
  }

  private async executarRoteamentoAtendimento(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    execucao: ExecucaoFluxoPersistida,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    const referencia =
      no.referencias.length === 1 && no.referencias[0]?.tipo === 'FILA'
        ? no.referencias[0]
        : undefined;
    if (
      referencia === undefined ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_ROTEAMENTO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const ator = {
      execucaoFluxoId: execucao.id,
      fluxoId: execucao.fluxoId,
      versaoFluxoId: execucao.versaoFluxoId,
    };
    if (no.tipo === 'TRANSFERIR_PARA_FILA') {
      const destinosTransferidos = definicao.conexoes.filter(
        ({ origemNoId, saida }) =>
          origemNoId === no.id && saida === 'TRANSFERIDO',
      );
      const destino = definicao.nos.find(
        ({ id }) => id === destinosTransferidos[0]?.destinoNoId,
      );
      if (
        !this.temExatamenteChaves(no.parametros, []) ||
        destinosTransferidos.length !== 1 ||
        destino?.tipo !== 'AGUARDAR_ATENDENTE' ||
        destino.referencias.length !== 1 ||
        destino.referencias[0]?.tipo !== 'FILA' ||
        destino.referencias[0].recursoId !== referencia.recursoId
      ) {
        return {
          codigo: 'CONFIGURACAO_TRANSFERENCIA_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      const transferido = await this.atribuicoes.encaminharParaFilaPorFluxo(
        ator,
        execucao.atendimentoId,
        referencia.recursoId,
        transacao,
        relogio,
      );
      return transferido
        ? { contextoProtegido: contexto, resultado: 'TRANSFERIDO' }
        : {
            codigo: 'TRANSFERENCIA_PARA_FILA_NEGADA',
            contextoProtegido: contexto,
            resultado: 'FALHA',
          };
    }
    if (no.tipo === 'ENCERRAR_ATENDIMENTO') {
      const motivo = Reflect.get(no.parametros, 'motivo');
      if (
        !this.temExatamenteChaves(no.parametros, ['motivo']) ||
        typeof motivo !== 'string' ||
        motivo.trim().length < 1 ||
        motivo.length > 500
      ) {
        return {
          codigo: 'CONFIGURACAO_ENCERRAMENTO_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      const encerrado = await this.atribuicoes.encerrarPorFluxo(
        ator,
        execucao.atendimentoId,
        referencia.recursoId,
        motivo.trim(),
        transacao,
        relogio,
      );
      return encerrado
        ? {
            conclusaoEspecial: 'CONCLUIR',
            contextoProtegido: contexto,
            resultado: 'ENCERRADO',
          }
        : {
            codigo: 'ENCERRAMENTO_POR_FLUXO_NEGADO',
            contextoProtegido: contexto,
            resultado: 'FALHA',
          };
    }
    const tempoLimiteSegundos = Reflect.get(
      no.parametros,
      'tempoLimiteSegundos',
    );
    if (
      no.tipo !== 'AGUARDAR_ATENDENTE' ||
      !this.temExatamenteChaves(no.parametros, ['tempoLimiteSegundos']) ||
      typeof tempoLimiteSegundos !== 'number' ||
      !Number.isInteger(tempoLimiteSegundos) ||
      tempoLimiteSegundos < 1 ||
      tempoLimiteSegundos > 86_400
    ) {
      return {
        codigo: 'CONFIGURACAO_ESPERA_ATENDENTE_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const estado = await this.atribuicoes.consultarEsperaAtendentePorFluxo(
      ator,
      execucao.atendimentoId,
      referencia.recursoId,
      transacao,
    );
    if (estado === 'ATENDIDO') {
      return {
        conclusaoEspecial: 'SUSPENDER_POR_ATENDIMENTO_HUMANO',
        contextoProtegido:
          removerEsperaFluxo(contexto, no.id) ?? contexto,
        resultado: 'ATENDIDO',
      };
    }
    if (estado === 'INVALIDO') {
      return {
        codigo: 'CONTEXTO_ESPERA_ATENDENTE_INVALIDO',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const existente = lerEsperaFluxo(contexto, no.id);
    if (existente.estado === 'INVALIDA') {
      return {
        codigo: 'CONTEXTO_ESPERA_ATENDENTE_INVALIDO',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) {
      throw new ErroExecucaoFluxoInvalida();
    }
    if (existente.estado === 'PRESENTE') {
      if (
        existente.espera.tipo !== 'ATENDENTE' ||
        agora < new Date(existente.espera.retomarEm)
      ) {
        return {
          codigo: 'RETOMADA_ESPERA_ATENDENTE_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      const atualizado = removerEsperaFluxo(contexto, no.id);
      return atualizado === undefined
        ? {
            codigo: 'CONTEXTO_ESPERA_ATENDENTE_INVALIDO',
            contextoProtegido: contexto,
            resultado: 'FALHA',
          }
        : { contextoProtegido: atualizado, resultado: 'TIMEOUT' };
    }
    const retomarEm = new Date(
      agora.getTime() + tempoLimiteSegundos * 1_000,
    );
    const atualizado = agendarEsperaFluxo(
      contexto,
      no.id,
      'ATENDENTE',
      retomarEm,
    );
    return atualizado === undefined
      ? {
          codigo: 'CONTEXTO_ESPERA_ATENDENTE_INVALIDO',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        }
      : {
          agendamento: {
            estadoEspera: 'AGUARDANDO_ATENDENTE',
            retomarEm,
          },
          contextoProtegido: atualizado,
          resultado: 'AGENDADO',
        };
  }

  private async executarFormulario(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    const textoFallback = Reflect.get(no.parametros, 'textoFallback');
    const referencia = no.referencias[0];
    if (
      !this.temExatamenteChaves(no.parametros, ['textoFallback']) ||
      typeof textoFallback !== 'string' ||
      no.referencias.length !== 1 ||
      referencia?.tipo !== 'FORMULARIO_WHATSAPP' ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_FORMULARIO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    if (
      !(await this.formularios.formularioAtivoNoAtendimento(
        referencia.recursoId,
        execucao.atendimentoId,
        transacao,
      ))
    ) {
      return {
        codigo: 'FORMULARIO_INDISPONIVEL',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const resultado = await this.mensagens.criarAutomatica(
      {
        atendimentoId: execucao.atendimentoId,
        execucaoFluxoId: execucao.id,
        revisaoExecucao: execucao.revisao,
        texto: textoFallback,
        tipo: 'TEXTO',
      },
      transacao,
      relogio,
    );
    if ('codigo' in resultado) {
      return {
        codigo: resultado.codigo,
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    return {
      contextoProtegido: contexto,
      ...(resultado.mensagem === undefined
        ? {}
        : { mensagem: resultado.mensagem }),
      resultado: 'FALLBACK',
    };
  }

  private async aplicarNoFatura(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    contexto: ObjetoJsonProtegido,
    acao: AcaoExternaFatura | undefined,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    if (
      (no.tipo !== 'CONSULTAR_FATURAS' && no.tipo !== 'ENVIAR_FATURA') ||
      !this.configuracaoNoFaturaValida(no) ||
      acao === undefined ||
      acao.preparacao.tipo !== no.tipo
    ) {
      return {
        codigo: 'CONFIGURACAO_FATURA_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    if (!(await this.faturas.contextoPermaneceValido(acao.preparacao, transacao))) {
      return {
        codigo: 'CONTEXTO_FINANCEIRO_ALTERADO',
        contextoProtegido: removerSelecaoFaturaExecucaoFluxo(contexto),
        resultado: 'FALHA',
      };
    }
    const resultado = acao.resultado;
    if (resultado.resultado === 'FALHA') {
      return {
        codigo: resultado.codigo,
        contextoProtegido: removerSelecaoFaturaExecucaoFluxo(contexto),
        resultado: 'FALHA',
      };
    }
    if (resultado.resultado === 'ERP_INDISPONIVEL') {
      return { contextoProtegido: contexto, resultado: 'ERP_INDISPONIVEL' };
    }
    if (no.tipo === 'CONSULTAR_FATURAS') {
      if (resultado.resultado === 'NAO_ENCONTRADA') {
        return {
          contextoProtegido: removerSelecaoFaturaExecucaoFluxo(contexto),
          resultado: 'NAO_ENCONTRADA',
        };
      }
      if (resultado.resultado !== 'ENCONTRADA') {
        throw new ErroExecucaoFluxoInvalida();
      }
      const atualizado = definirSelecaoFaturaExecucaoFluxo(
        contexto,
        resultado.selecao,
      );
      return atualizado === undefined
        ? {
            codigo: 'CONTEXTO_FATURA_INVALIDO',
            contextoProtegido: removerSelecaoFaturaExecucaoFluxo(contexto),
            resultado: 'FALHA',
          }
        : { contextoProtegido: atualizado, resultado: 'ENCONTRADA' };
    }
    if (
      resultado.resultado !== 'SUCESSO' &&
      resultado.resultado !== 'DADOS_INCOMPLETOS'
    ) {
      throw new ErroExecucaoFluxoInvalida();
    }
    const mensagem = await this.mensagens.criarAutomatica(
      {
        atendimentoId: execucao.atendimentoId,
        execucaoFluxoId: execucao.id,
        revisaoExecucao: execucao.revisao,
        texto: resultado.composicao.textoProtegido,
        tipo: 'TEXTO',
      },
      transacao,
      relogio,
    );
    if ('codigo' in mensagem) {
      return {
        codigo: mensagem.codigo,
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    await this.faturas.registrarComposicao(
      {
        atendimentoId: execucao.atendimentoId,
        composicao: resultado.composicao,
        fluxoId: execucao.fluxoId,
        versaoFluxoId: execucao.versaoFluxoId,
      },
      transacao,
    );
    return {
      contextoProtegido: removerSelecaoFaturaExecucaoFluxo(contexto),
      mensagem: mensagem.mensagem,
      resultado: resultado.resultado,
    };
  }

  private configuracaoNoFaturaValida(
    no: NoDefinicaoFluxo,
  ): no is NoDefinicaoFluxo & { readonly tipo: TipoNoFaturaFluxo } {
    return (
      (no.tipo === 'CONSULTAR_FATURAS' || no.tipo === 'ENVIAR_FATURA') &&
      this.temExatamenteChaves(no.parametros, []) &&
      no.referencias.length === 0 &&
      no.variaveisEntrada.length === 0 &&
      no.variaveisSaida.length === 0
    );
  }

  private async executarIdentidade(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    execucao: ExecucaoFluxoPersistida,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    if (no.tipo === 'IDENTIFICAR_CONTATO') {
      if (
        !this.temExatamenteChaves(no.parametros, []) ||
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        return {
          codigo: 'CONFIGURACAO_IDENTIDADE_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      return {
        contextoProtegido: contexto,
        resultado: (await this.contextosCliente.identificarParaFluxo(
          execucao.atendimentoId,
          transacao,
        ))
          ? 'IDENTIFICADO'
          : 'NAO_IDENTIFICADO',
      };
    }
    if (no.tipo === 'SOLICITAR_DADOS_CONTATO') {
      const textoFallback = Reflect.get(no.parametros, 'textoFallback');
      if (
        !this.temExatamenteChaves(no.parametros, ['textoFallback']) ||
        typeof textoFallback !== 'string' ||
        no.referencias.length !== 0 ||
        no.variaveisEntrada.length !== 0 ||
        no.variaveisSaida.length !== 0
      ) {
        return {
          codigo: 'CONFIGURACAO_IDENTIDADE_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      const resultado = await this.mensagens.criarAutomatica(
        {
          atendimentoId: execucao.atendimentoId,
          execucaoFluxoId: execucao.id,
          revisaoExecucao: execucao.revisao,
          texto: textoFallback,
          tipo: 'TEXTO',
        },
        transacao,
        relogio,
      );
      if (!('codigo' in resultado)) {
        return {
          contextoProtegido: contexto,
          ...(resultado.mensagem === undefined
            ? {}
            : { mensagem: resultado.mensagem }),
          resultado: 'FALLBACK',
        };
      }
      return {
        codigo: resultado.codigo,
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const variavel = this.obterVariavelDoNo(no, definicao, 'ENTRADA');
    if (
      variavel?.tipo !== 'UUID' ||
      !variavel.sensivel ||
      no.referencias.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_SELECAO_CONTEXTO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const vinculoId = lerValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
    );
    if (typeof vinculoId !== 'string') {
      return {
        contextoProtegido: contexto,
        resultado: 'NAO_SELECIONADO',
      };
    }
    const ator = {
      atendimentoId: execucao.atendimentoId,
      fluxoId: execucao.fluxoId,
      versaoFluxoId: execucao.versaoFluxoId,
    };
    const selecionado =
      no.tipo === 'SELECIONAR_CLIENTE'
        ? await this.contextosCliente.selecionarClientePorFluxo(
            { ...ator, vinculoClienteId: vinculoId },
            transacao,
            relogio,
          )
        : await this.contextosCliente.selecionarContratoPorFluxo(
            { ...ator, vinculoContratoId: vinculoId },
            transacao,
            relogio,
          );
    return {
      contextoProtegido: contexto,
      resultado: selecionado ? 'SELECIONADO' : 'NAO_SELECIONADO',
    };
  }

  private executarEspera(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    relogio: () => Date,
  ): ResultadoExecucaoNo {
    const configuracao = this.lerConfiguracaoEspera(no);
    if (configuracao === undefined) {
      return { codigo: 'CONFIGURACAO_ESPERA_INVALIDA', resultado: 'FALHA' };
    }
    const existente = lerEsperaFluxo(execucao.contextoProtegido, no.id);
    if (existente.estado === 'INVALIDA') {
      return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime()) || agora < execucao.atualizadaEm) {
      throw new ErroExecucaoFluxoInvalida();
    }
    if (existente.estado === 'PRESENTE') {
      const retomarEm = new Date(existente.espera.retomarEm);
      const coerenteComDefinicao =
        existente.espera.tipo === configuracao.tipo &&
        (configuracao.tipo !== 'ATE_INSTANTE' ||
          configuracao.retomarEm.toISOString() ===
            existente.espera.retomarEm);
      if (!coerenteComDefinicao) {
        return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
      }
      if (!existente.espera.respostaRecebida && agora < retomarEm) {
        return { codigo: 'RETOMADA_ESPERA_PREMATURA', resultado: 'FALHA' };
      }
      const contexto = removerEsperaFluxo(execucao.contextoProtegido, no.id);
      if (contexto === undefined) {
        return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
      }
      return {
        contextoProtegido: contexto,
        resultado:
          configuracao.tipo === 'RESPOSTA' &&
          !existente.espera.respostaRecebida
            ? 'TIMEOUT'
            : 'CONCLUIDO',
      };
    }

    const iteracao = registrarIteracaoNoFluxo(
      execucao.contextoProtegido,
      no.id,
      no.limiteIteracoes,
    );
    if (!iteracao.valido) {
      return { codigo: 'CONTEXTO_ITERACOES_INVALIDO', resultado: 'FALHA' };
    }
    if (iteracao.excedeu) {
      return {
        codigo: 'LIMITE_ITERACOES_EXCEDIDO',
        contextoProtegido: iteracao.contexto,
        resultado: 'FALHA',
      };
    }
    const retomarEm =
      configuracao.tipo === 'ATE_INSTANTE'
        ? configuracao.retomarEm
        : new Date(agora.getTime() + configuracao.tempoLimiteSegundos * 1_000);
    if (retomarEm <= agora) {
      return { contextoProtegido: iteracao.contexto, resultado: 'CONCLUIDO' };
    }
    const contexto = agendarEsperaFluxo(
      iteracao.contexto,
      no.id,
      configuracao.tipo,
      retomarEm,
    );
    if (contexto === undefined) {
      return { codigo: 'CONTEXTO_ESPERA_INVALIDO', resultado: 'FALHA' };
    }
    return {
      agendamento: {
        estadoEspera:
          configuracao.tipo === 'RESPOSTA'
            ? 'AGUARDANDO_RESPOSTA'
            : 'AGUARDANDO_SISTEMA',
        retomarEm,
      },
      contextoProtegido: contexto,
      resultado: 'AGENDADO',
    };
  }

  private async avaliarHorarioAtendimento(
    no: NoDefinicaoFluxo,
    contexto: ObjetoJsonProtegido,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ): Promise<ResultadoExecucaoNo> {
    const referencia =
      no.referencias.length === 1 && no.referencias[0]?.tipo === 'CALENDARIO'
        ? no.referencias[0]
        : undefined;
    if (
      referencia === undefined ||
      Object.keys(no.parametros).length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return {
        codigo: 'CONFIGURACAO_CALENDARIO_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroExecucaoFluxoInvalida();
    try {
      const resultado = await this.calendarios.avaliar(
        referencia.recursoId,
        agora,
        transacao,
      );
      return {
        contextoProtegido: contexto,
        resultado:
          resultado.estado === 'ABERTO'
            ? 'DENTRO_HORARIO'
            : 'FORA_HORARIO',
      };
    } catch (erro) {
      if (erro instanceof ErroCalendarioAusente) {
        return {
          codigo: 'CALENDARIO_INDISPONIVEL',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      if (erro instanceof ErroCalendarioInvalido) {
        return {
          codigo: 'CALENDARIO_INVALIDO',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        };
      }
      throw erro;
    }
  }

  private lerConfiguracaoEspera(no: NoDefinicaoFluxo):
    | { readonly tipo: 'ATE_INSTANTE'; readonly retomarEm: Date }
    | {
        readonly tipo: 'RESPOSTA';
        readonly tempoLimiteSegundos: number;
      }
    | undefined {
    const tipo = Reflect.get(no.parametros, 'tipo');
    if (
      no.referencias.length !== 0 ||
      no.variaveisEntrada.length !== 0 ||
      no.variaveisSaida.length !== 0
    ) {
      return undefined;
    }
    if (
      tipo === 'RESPOSTA' &&
      this.temExatamenteChaves(no.parametros, [
        'tempoLimiteSegundos',
        'tipo',
      ])
    ) {
      const tempo = Reflect.get(no.parametros, 'tempoLimiteSegundos');
      return typeof tempo === 'number' &&
        Number.isInteger(tempo) &&
        tempo >= 1 &&
        tempo <= 86_400
        ? { tempoLimiteSegundos: tempo, tipo }
        : undefined;
    }
    if (
      tipo === 'ATE_INSTANTE' &&
      this.temExatamenteChaves(no.parametros, ['retomarEm', 'tipo'])
    ) {
      const valor = Reflect.get(no.parametros, 'retomarEm');
      if (
        typeof valor !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(valor) ||
        !Number.isFinite(Date.parse(valor)) ||
        new Date(valor).toISOString() !== valor
      ) {
        return undefined;
      }
      return { retomarEm: new Date(valor), tipo };
    }
    return undefined;
  }

  private temExatamenteChaves(
    valor: Readonly<Record<string, unknown>>,
    chaves: readonly string[],
  ): boolean {
    return (
      Object.keys(valor).length === chaves.length &&
      Object.keys(valor).every((chave) => chaves.includes(chave))
    );
  }

  private definirVariavel(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    contexto: ObjetoJsonProtegido,
  ): ResultadoExecucaoNo {
    const variavel = this.obterVariavelDoNo(no, definicao, 'SAIDA');
    const valor = Reflect.get(no.parametros, 'valor');
    if (
      variavel === undefined ||
      variavel.sensivel ||
      !valorCompativelComTipo(variavel.tipo, valor)
    ) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const atualizado = definirValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
      valor,
    );
    if (atualizado === undefined) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    return { contextoProtegido: atualizado, resultado: 'SUCESSO' };
  }

  private avaliarCondicao(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    contexto: ObjetoJsonProtegido,
  ): ResultadoExecucaoNo {
    const variavel = this.obterVariavelDoNo(no, definicao, 'ENTRADA');
    const operador = Reflect.get(no.parametros, 'operador');
    const esperado = Reflect.get(no.parametros, 'valor');
    if (
      variavel === undefined ||
      !ehOperadorCondicaoFluxo(operador) ||
      !valorCompativelComTipo(variavel.tipo, esperado)
    ) {
      return {
        codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const atual = lerValorVariavelExecucao(
      contexto,
      variavel.nome,
      variavel.tipo,
    );
    if (atual === undefined) {
      return {
        codigo: 'VARIAVEL_INDISPONIVEL',
        contextoProtegido: contexto,
        resultado: 'FALHA',
      };
    }
    const resultado = avaliarCondicaoTipada(
      variavel.tipo,
      operador,
      atual,
      esperado,
    );
    return resultado === undefined
      ? {
          codigo: 'CONFIGURACAO_VARIAVEL_INVALIDA',
          contextoProtegido: contexto,
          resultado: 'FALHA',
        }
      : {
          contextoProtegido: contexto,
          resultado: resultado ? 'VERDADEIRO' : 'FALSO',
        };
  }

  private obterVariavelDoNo(
    no: NoDefinicaoFluxo,
    definicao: DefinicaoFluxoV1,
    direcao: 'ENTRADA' | 'SAIDA',
  ): VariavelDefinicaoFluxo | undefined {
    const nome = Reflect.get(no.parametros, 'variavel');
    const nomes = direcao === 'ENTRADA' ? no.variaveisEntrada : no.variaveisSaida;
    const opostos = direcao === 'ENTRADA' ? no.variaveisSaida : no.variaveisEntrada;
    if (
      typeof nome !== 'string' ||
      nomes.length !== 1 ||
      nomes[0] !== nome ||
      opostos.length !== 0
    ) {
      return undefined;
    }
    return definicao.variaveis.find((variavel) => variavel.nome === nome);
  }

  private executarMensagem(
    no: NoDefinicaoFluxo,
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
  ) {
    const texto = Reflect.get(no.parametros, 'texto');
    if (no.tipo === 'ENVIAR_MENSAGEM') {
      return this.mensagens.criarAutomatica(
        {
          atendimentoId: execucao.atendimentoId,
          execucaoFluxoId: execucao.id,
          revisaoExecucao: execucao.revisao,
          texto,
          tipo: 'TEXTO',
        },
        transacao,
        relogio,
      );
    }
    return this.mensagens.criarAutomatica(
      {
        atendimentoId: execucao.atendimentoId,
        execucaoFluxoId: execucao.id,
        opcoes: Reflect.get(no.parametros, 'opcoes'),
        revisaoExecucao: execucao.revisao,
        texto,
        tipo: 'LISTA',
      },
      transacao,
      relogio,
    );
  }

  private async finalizarPasso(
    iniciado: PassoExecucaoFluxoPersistido,
    saidaSanitizada: PassoExecucaoFluxoPersistido['entradaSanitizada'],
    codigoErro: string | undefined,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const finalizado: PassoExecucaoFluxoPersistido = {
      ...iniciado,
      ...(codigoErro === undefined ? {} : { codigoErro }),
      estado: codigoErro === undefined ? 'CONCLUIDO' : 'FALHOU',
      finalizadoEm: agora,
      saidaSanitizada,
    };
    if (!(await this.repositorioPassos.finalizar(finalizado, transacao))) {
      throw new ErroConflitoExecucaoFluxo();
    }
  }

  private validarSaida(
    no: NoDefinicaoFluxo,
    resultado: string,
  ):
    | ResultadoNoMensagemFluxo
    | 'SUCESSO'
    | 'VERDADEIRO'
    | 'FALSO'
    | 'FALHA'
    | 'CONCLUIDO'
    | 'TIMEOUT'
    | 'DENTRO_HORARIO'
    | 'FORA_HORARIO'
    | 'IDENTIFICADO'
    | 'NAO_IDENTIFICADO'
    | 'ENVIADO'
    | 'SELECIONADO'
    | 'NAO_SELECIONADO'
    | 'ENCONTRADA'
    | 'NAO_ENCONTRADA'
    | 'ERP_INDISPONIVEL'
    | 'DADOS_INCOMPLETOS'
    | 'ELEGIVEL'
    | 'NAO_ELEGIVEL'
    | 'CRIADO'
    | 'CRIADA'
    | 'RESULTADO_INCERTO'
    | 'INDISPONIVEL'
    | 'TRANSFERIDO'
    | 'ATENDIDO'
    | 'ENCERRADO' {
    const permitidas = (() => {
      if (no.tipo === 'ENVIAR_BOTOES_OU_LISTA') {
        return new Set([
          'SUCESSO',
          'FALLBACK',
          'FALHA_TEMPORARIA',
          'FALHA_DEFINITIVA',
        ]);
      }
      if (no.tipo === 'ENVIAR_MENSAGEM') {
        return new Set(['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA']);
      }
      if (no.tipo === 'CONDICAO') {
        return new Set(['VERDADEIRO', 'FALSO', 'FALHA']);
      }
      if (no.tipo === 'DEFINIR_VARIAVEL') {
        return new Set(['SUCESSO', 'FALHA']);
      }
      if (no.tipo === 'AGUARDAR') {
        return new Set(['CONCLUIDO', 'TIMEOUT', 'FALHA']);
      }
      if (no.tipo === 'HORARIO_ATENDIMENTO') {
        return new Set(['DENTRO_HORARIO', 'FORA_HORARIO', 'FALHA']);
      }
      if (no.tipo === 'IDENTIFICAR_CONTATO') {
        return new Set(['IDENTIFICADO', 'NAO_IDENTIFICADO', 'FALHA']);
      }
      if (
        no.tipo === 'SOLICITAR_DADOS_CONTATO' ||
        no.tipo === 'SOLICITAR_FORMULARIO_WHATSAPP'
      ) {
        return new Set(['ENVIADO', 'FALLBACK', 'FALHA']);
      }
      if (
        no.tipo === 'SELECIONAR_CLIENTE' ||
        no.tipo === 'SELECIONAR_CONTRATO'
      ) {
        return new Set(['SELECIONADO', 'NAO_SELECIONADO', 'FALHA']);
      }
      if (no.tipo === 'CONSULTAR_FATURAS') {
        return new Set([
          'ENCONTRADA',
          'NAO_ENCONTRADA',
          'ERP_INDISPONIVEL',
          'FALHA',
        ]);
      }
      if (no.tipo === 'ENVIAR_FATURA') {
        return new Set([
          'SUCESSO',
          'DADOS_INCOMPLETOS',
          'ERP_INDISPONIVEL',
          'FALHA',
        ]);
      }
      if (no.tipo === 'VERIFICAR_DESBLOQUEIO_CONFIANCA') {
        return new Set([
          'ELEGIVEL',
          'NAO_ELEGIVEL',
          'INDISPONIVEL',
          'FALHA',
        ]);
      }
      if (no.tipo === 'EXECUTAR_DESBLOQUEIO_CONFIANCA') {
        return new Set([
          'CONCLUIDO',
          'NAO_ELEGIVEL',
          'RESULTADO_INCERTO',
          'FALHA',
        ]);
      }
      if (no.tipo === 'CRIAR_ATENDIMENTO') {
        return new Set([
          'CRIADO',
          'RESULTADO_INCERTO',
          'INDISPONIVEL',
          'FALHA',
        ]);
      }
      if (no.tipo === 'CRIAR_ORDEM_SERVICO') {
        return new Set([
          'CRIADA',
          'RESULTADO_INCERTO',
          'INDISPONIVEL',
          'FALHA',
        ]);
      }
      if (no.tipo === 'TRANSFERIR_PARA_FILA') {
        return new Set(['TRANSFERIDO', 'FALHA']);
      }
      if (no.tipo === 'AGUARDAR_ATENDENTE') {
        return new Set(['ATENDIDO', 'TIMEOUT', 'FALHA']);
      }
      if (no.tipo === 'ENCERRAR_ATENDIMENTO') {
        return new Set(['ENCERRADO', 'FALHA']);
      }
      return new Set(['SUCESSO']);
    })();
    if (!permitidas.has(resultado)) throw new ErroExecucaoFluxoInvalida();
    return resultado as
      | ResultadoNoMensagemFluxo
      | 'SUCESSO'
      | 'VERDADEIRO'
      | 'FALSO'
      | 'FALHA'
      | 'CONCLUIDO'
      | 'TIMEOUT'
      | 'DENTRO_HORARIO'
      | 'FORA_HORARIO'
      | 'IDENTIFICADO'
      | 'NAO_IDENTIFICADO'
      | 'ENVIADO'
      | 'SELECIONADO'
      | 'NAO_SELECIONADO'
      | 'ENCONTRADA'
      | 'NAO_ENCONTRADA'
      | 'ERP_INDISPONIVEL'
      | 'DADOS_INCOMPLETOS'
      | 'ELEGIVEL'
      | 'NAO_ELEGIVEL'
      | 'CRIADO'
      | 'CRIADA'
      | 'RESULTADO_INCERTO'
      | 'INDISPONIVEL'
      | 'TRANSFERIDO'
      | 'ATENDIDO'
      | 'ENCERRADO';
  }

  private obterDestino(
    conexoes: readonly ConexaoDefinicaoFluxo[],
    noId: string,
    saida: string,
  ): string {
    const correspondentes = conexoes.filter(
      (conexao) => conexao.origemNoId === noId && conexao.saida === saida,
    );
    if (correspondentes.length !== 1) throw new ErroExecucaoFluxoInvalida();
    return correspondentes[0]!.destinoNoId;
  }

  private lerDefinicao(valor: unknown): DefinicaoFluxoV1 {
    if (
      valor === null ||
      typeof valor !== 'object' ||
      Array.isArray(valor) ||
      Reflect.get(valor, 'versaoSchema') !== 1 ||
      !Array.isArray(Reflect.get(valor, 'nos')) ||
      !Array.isArray(Reflect.get(valor, 'conexoes'))
    ) {
      throw new ErroExecucaoFluxoInvalida();
    }
    return valor as unknown as DefinicaoFluxoV1;
  }
}
