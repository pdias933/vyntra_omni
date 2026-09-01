import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type {
  ConexaoDefinicaoFluxo,
  DefinicaoFluxoV1,
  NoDefinicaoFluxo,
  VariavelDefinicaoFluxo,
} from '../fluxos/modelo-validacao-fluxo.js';
import { ServicoCatalogoFluxos } from '../fluxos/servico-catalogo-fluxos.js';
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

const TIPOS_SUPORTADOS = new Set([
  'CONDICAO',
  'DEFINIR_VARIAVEL',
  'ENVIAR_BOTOES_OU_LISTA',
  'ENVIAR_MENSAGEM',
  'FIM',
  'INICIO',
]);

interface ResultadoExecucaoNo {
  readonly resultado: string;
  readonly codigo?: string | undefined;
  readonly contextoProtegido?: ObjetoJsonProtegido | undefined;
  readonly mensagem?: { readonly id: string } | undefined;
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
    @Inject(ServicoMensagensSaida)
    private readonly mensagens: ServicoMensagensSaida,
    @Inject(ServicoExecucoesFluxo)
    private readonly execucoes: ServicoExecucoesFluxo,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
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
            await this.executarNo(execucao, transacao, relogio);
            return true;
          },
        );
        if (!encontrou) break;
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

  private async executarNo(
    execucao: ExecucaoFluxoPersistida,
    transacao: TransacaoPrisma,
    relogio: () => Date,
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
    );
    const saida = this.validarSaida(no, resultado.resultado);
    const destino = this.obterDestino(definicao.conexoes, no.id, saida);
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
  ): Promise<ResultadoExecucaoNo> {
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
    throw new ErroExecucaoFluxoInvalida();
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
  ): ResultadoNoMensagemFluxo | 'SUCESSO' | 'VERDADEIRO' | 'FALSO' | 'FALHA' {
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
      return new Set(['SUCESSO']);
    })();
    if (!permitidas.has(resultado)) throw new ErroExecucaoFluxoInvalida();
    return resultado as
      | ResultadoNoMensagemFluxo
      | 'SUCESSO'
      | 'VERDADEIRO'
      | 'FALSO'
      | 'FALHA';
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
