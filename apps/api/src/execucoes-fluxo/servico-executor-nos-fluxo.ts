import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type {
  ConexaoDefinicaoFluxo,
  DefinicaoFluxoV1,
  NoDefinicaoFluxo,
} from '../fluxos/modelo-validacao-fluxo.js';
import { ServicoCatalogoFluxos } from '../fluxos/servico-catalogo-fluxos.js';
import { ServicoMensagensSaida } from '../mensagens/servico-mensagens-saida.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
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
  'ENVIAR_BOTOES_OU_LISTA',
  'ENVIAR_MENSAGEM',
  'FIM',
  'INICIO',
]);

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
    return this.prisma.executarTransacao(async (transacao) => {
      const prontas = await this.repositorioExecucoes.listarProntasParaExecutar(
        limite,
        transacao,
      );
      for (const execucao of prontas) {
        await this.executarNo(execucao, transacao, relogio);
      }
      return prontas.length;
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

    const resultado =
      no.tipo === 'INICIO'
        ? ({ resultado: 'SUCESSO' } as const)
        : await this.executarMensagem(no, execucao, transacao, relogio);
    const saida = this.validarSaida(no, resultado.resultado);
    const destino = this.obterDestino(definicao.conexoes, no.id, saida);
    const codigo = 'codigo' in resultado ? resultado.codigo : undefined;
    const mensagemId =
      'mensagem' in resultado ? resultado.mensagem.id : undefined;
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
        execucaoFluxoId: execucao.id,
        proximoNoId: destino,
        revisaoEsperada: execucao.revisao,
      },
      transacao,
      () => agora,
    );
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
  ): ResultadoNoMensagemFluxo | 'SUCESSO' {
    const permitidas =
      no.tipo === 'ENVIAR_BOTOES_OU_LISTA'
        ? new Set([
            'SUCESSO',
            'FALLBACK',
            'FALHA_TEMPORARIA',
            'FALHA_DEFINITIVA',
          ])
        : new Set(['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA']);
    if (!permitidas.has(resultado)) throw new ErroExecucaoFluxoInvalida();
    return resultado as ResultadoNoMensagemFluxo | 'SUCESSO';
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
